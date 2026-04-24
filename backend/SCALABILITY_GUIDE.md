# MAVEN Backend — Scalability & Production Deployment Guide

> A step-by-step plan to take the MAVEN backend from a single-server dev setup to a production-ready system that handles thousands of concurrent users.

---

## Table of Contents

1. [Current Bottlenecks](#1-current-bottlenecks)
2. [Phase 1: Quick Wins (No Architecture Changes)](#2-phase-1-quick-wins)
3. [Phase 2: Job Queue System](#3-phase-2-job-queue-system)
4. [Phase 3: Horizontal Scaling](#4-phase-3-horizontal-scaling)
5. [Phase 4: Infrastructure & DevOps](#5-phase-4-infrastructure--devops)
6. [Phase 5: Advanced Optimizations](#6-phase-5-advanced-optimizations)
7. [Deployment Architecture Diagram](#7-deployment-architecture-diagram)
8. [Implementation Priority Roadmap](#8-implementation-priority-roadmap)

---

## 1. Current Bottlenecks

Before scaling, you need to know **what breaks first** under heavy traffic.

### Bottleneck Map

| Component | Current Limit | What Breaks |
|---|---|---|
| **Video Upload** | Files stored in Node.js memory (RAM) | 100 simultaneous 5MB uploads = 500MB RAM spike |
| **ML Orchestrator** | Un-awaited promises in Node.js event loop | Too many background tasks = event loop starvation |
| **Socket.io** | In-memory rooms on a single server | Can't scale to multiple servers (rooms are local) |
| **Single Server** | One Express process | One server crash = entire platform down |
| **No Rate Limiting** | Anyone can spam the API | DDoS or abuse eats all resources |
| **No Caching** | Every request hits the database | Repeated history fetches = unnecessary DB load |
| **Supabase Connection Pool** | Default pool limits | Too many concurrent queries = connection exhaustion |

---

## 2. Phase 1: Quick Wins

**Effort: Low | Impact: High | No architecture changes needed**

These changes can be done immediately in the existing codebase.

---

### 2.1 — Rate Limiting

**Problem:** Nothing stops a user (or attacker) from sending 1000 requests per second.

**Solution:** Add `express-rate-limit` middleware.

```bash
npm install express-rate-limit
```

**Implementation — `src/middleware/rateLimit.middleware.js`:**
```javascript
const rateLimit = require('express-rate-limit');

// General API rate limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 100,                    // 100 requests per 15 min per IP
    message: { error: 'Too many requests, please try again later' }
});

// Stricter limit for video uploads (expensive operation)
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 10,                     // 10 uploads per hour per IP
    message: { error: 'Upload limit reached. Try again in an hour.' }
});

module.exports = { apiLimiter, uploadLimiter };
```

**Mount in `app.js`:**
```javascript
const { apiLimiter, uploadLimiter } = require('./middleware/rateLimit.middleware');

app.use('/api', apiLimiter);               // All API routes
app.use('/api/analysis', uploadLimiter);    // Extra strict for uploads
```

---

### 2.2 — Response Compression

**Problem:** JSON responses and large payloads waste bandwidth.

**Solution:** Add `compression` middleware — gzip compresses responses automatically.

```bash
npm install compression
```

```javascript
const compression = require('compression');
app.use(compression());  // Add before routes
```

**Impact:** 60-80% reduction in response size. Free performance boost.

---

### 2.3 — Helmet (Security Headers)

**Problem:** Missing security headers make the API vulnerable to common attacks.

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());  // Add before routes
```

**What it does:** Sets headers like `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` — protects against clickjacking, MIME sniffing, and other common attacks.

---

### 2.4 — CORS Lockdown

**Problem:** Current CORS is `origin: "*"` — any website can call your API.

**Fix in `app.js`:**
```javascript
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
}));
```

Same for Socket.io:
```javascript
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});
```

---

### 2.5 — Caching with Redis

**Problem:** Every call to `GET /api/results/history` queries the database, even if nothing changed.

**Solution:** Cache frequently-read data in Redis (in-memory store).

```bash
npm install redis
```

**Implementation idea:**
```javascript
const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

// Cache user history for 60 seconds
async function getUserJobHistory(userId) {
    const cacheKey = `history:${userId}`;
    const cached = await client.get(cacheKey);
    
    if (cached) return JSON.parse(cached);  // Cache hit — skip DB
    
    const { data } = await supabaseAdmin
        .from('analysis_jobs').select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    
    await client.setEx(cacheKey, 60, JSON.stringify(data));  // Cache for 60s
    return data;
}
```

**Invalidate cache** when a new job completes:
```javascript
// In saveAnalysisResult(), after saving:
await client.del(`history:${userId}`);
```

---

## 3. Phase 2: Job Queue System

**Effort: Medium | Impact: Very High**

This is the **single biggest scalability improvement** you can make.

---

### The Problem

Currently, `runMLAnalysis()` runs as an un-awaited promise inside the Node.js event loop. This works for 5 users but fails at scale:

- 100 simultaneous uploads = 100 background promises = event loop starvation
- If the server crashes mid-analysis, all in-flight jobs are lost forever (stuck in `PROCESSING`)
- No retry mechanism — if an ML service has a temporary glitch, the job just fails
- No concurrency control — all 100 jobs hit the ML services simultaneously

### The Solution: BullMQ + Redis

**BullMQ** is a job queue library. Instead of running analysis in the event loop, you push a job to a queue. A separate **worker process** picks it up.

```bash
npm install bullmq
```

### Architecture Change

```
BEFORE (fragile):
Controller → runMLAnalysis() in event loop → hope it works

AFTER (robust):
Controller → push job to Redis queue → respond 202
Worker process → pull job from queue → runMLAnalysis() → retry on failure
```

### Implementation

**Create `src/queues/analysisQueue.js`:**
```javascript
const { Queue } = require('bullmq');

const analysisQueue = new Queue('video-analysis', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    }
});

module.exports = { analysisQueue };
```

**Create `src/workers/analysisWorker.js`:**
```javascript
const { Worker } = require('bullmq');
const { runMLAnalysis } = require('../services/mlOrchestrator');

const worker = new Worker('video-analysis', async (job) => {
    const { videoPath, jobId } = job.data;
    await runMLAnalysis(videoPath, jobId);
}, {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
    concurrency: 5,  // Process max 5 jobs simultaneously
});

worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
    console.log(`Job ${job.id} failed: ${err.message}`);
});
```

**Update `analysis.controller.js`:**
```javascript
// BEFORE:
runMLAnalysis(videoPath, jobId).catch(...);

// AFTER:
const { analysisQueue } = require('../queues/analysisQueue');
await analysisQueue.add('analyze', { videoPath, jobId }, {
    attempts: 3,              // Retry up to 3 times
    backoff: { type: 'exponential', delay: 5000 },  // Wait 5s, 10s, 20s
    removeOnComplete: true,
});
```

### What This Gives You

| Feature | Before | After |
|---|---|---|
| Server crash during analysis | Jobs lost forever | Jobs automatically retry |
| 100 simultaneous uploads | Event loop starvation | Queue processes 5 at a time |
| ML service temporary failure | Job fails permanently | Retries 3 times with backoff |
| Monitoring | No visibility | Dashboard shows queue length, failures, processing time |
| Scaling | Single process | Add more worker processes |

---

## 4. Phase 3: Horizontal Scaling

**Effort: Medium-High | Impact: High**

Run multiple instances of your backend behind a load balancer.

---

### 4.1 — Cluster Mode with PM2

**PM2** is a process manager that runs multiple instances of your app on one server.

```bash
npm install -g pm2
```

**Create `ecosystem.config.js`:**
```javascript
module.exports = {
    apps: [{
        name: 'maven-api',
        script: 'server.js',
        instances: 'max',       // One process per CPU core
        exec_mode: 'cluster',   // Cluster mode
        env: {
            NODE_ENV: 'production',
        }
    }, {
        name: 'maven-worker',
        script: 'src/workers/analysisWorker.js',
        instances: 2,           // 2 worker processes
    }]
};
```

```bash
pm2 start ecosystem.config.js
pm2 monit    # Live dashboard
pm2 logs     # Stream all logs
```

**Impact:** If you have 4 CPU cores, PM2 runs 4 instances of your API — 4x throughput immediately.

---

### 4.2 — Socket.io with Redis Adapter

**Problem:** When running multiple server instances, Socket.io rooms are local to each process. If User A connects to Server 1 and the analysis finishes on Server 2, the emit never reaches User A.

**Solution:** `@socket.io/redis-adapter` — syncs Socket.io events across all instances via Redis.

```bash
npm install @socket.io/redis-adapter redis
```

**Update `app.js`:**
```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
});
```

**Now:** When Server 2 emits `analysis_complete`, Redis broadcasts it to all servers, and Server 1 delivers it to User A.

---

### 4.3 — Load Balancer (Nginx)

Put Nginx in front of your Node.js instances to distribute traffic.

**`/etc/nginx/sites-available/maven`:**
```nginx
upstream maven_backend {
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    server 127.0.0.1:4003;
}

server {
    listen 80;
    server_name api.maven.com;

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://maven_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # REST API
    location / {
        proxy_pass http://maven_backend;
        proxy_set_header X-Real-IP $remote_addr;

        # File upload size limit
        client_max_body_size 10M;
    }
}
```

---

## 5. Phase 4: Infrastructure & DevOps

---

### 5.1 — Docker Containerization

**`Dockerfile`:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
```

**`docker-compose.yml`:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "4000:4000"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  worker:
    build: .
    command: node src/workers/analysisWorker.js
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  fft-service:
    build: ../ml_services/fft
    ports:
      - "8001:8001"

  liveness-service:
    build: ../ml_services/liveness
    ports:
      - "8002:8002"

  lipsync-service:
    build: ../ml_services/lipsync
    ports:
      - "8003:8003"
```

**Run everything:** `docker-compose up -d`

---

### 5.2 — Health Checks & Monitoring

**Enhanced health check in `app.js`:**
```javascript
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
    };

    // Check Supabase connectivity
    try {
        await supabaseAdmin.from('users').select('id').limit(1);
        health.database = 'connected';
    } catch {
        health.database = 'disconnected';
        health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
});
```

---

### 5.3 — Logging for Production

**Add file logging to Winston:**
```javascript
const logger = winston.createLogger({
    level: config.nodeEnv === 'production' ? 'warn' : 'info',
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.Console({ format: combine(colorize(), logFormat) }),
        // Production: write error logs to file
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});
```

**Integrate with a monitoring service** (Datadog, Grafana, or Sentry) for alerts.

---

## 6. Phase 5: Advanced Optimizations

---

### 6.1 — Direct Upload to Supabase Storage (Skip Server RAM)

**Current flow:**
```
Frontend → uploads file to Express (uses server RAM) → Express uploads to Supabase
```

**Optimized flow:**
```
Frontend → gets a pre-signed upload URL from Express → uploads directly to Supabase Storage
```

This completely removes the file from server memory. The server only generates a signed upload URL.

---

### 6.2 — Database Connection Pooling

For high traffic, use Supabase's connection pooler (PgBouncer) instead of direct connections:

```
# .env
SUPABASE_URL=https://your-project.supabase.co  # Pooled connection
```

Supabase dashboard → Settings → Database → Connection Pooling → Enable.

---

### 6.3 — CDN for Static Assets

If your frontend is served from the same server, put a CDN (Cloudflare, CloudFront) in front to cache static assets. This reduces server load dramatically for repeat visitors.

---

### 6.4 — Auto-Scaling on Cloud

**AWS / GCP / Azure:** Use container orchestration (ECS, Cloud Run, or Kubernetes) to auto-scale based on CPU/memory usage.

**Example AWS ECS scaling rule:**
```
If CPU > 70% for 3 minutes → add 1 container (max 10)
If CPU < 30% for 5 minutes → remove 1 container (min 2)
```

---

## 7. Deployment Architecture Diagram

### Current (Single Server)
```
┌──────────────────────────────────┐
│          Single Server            │
│                                  │
│  Express + Socket.io + Workers   │
│                                  │
│  Everything in one process       │
└──────────────┬───────────────────┘
               │
         ┌─────▼─────┐
         │  Supabase  │
         └───────────┘
```

### Target (Production-Ready)
```
                    ┌─────────────┐
                    │  Cloudflare  │  ← CDN + DDoS protection
                    │     CDN      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Nginx     │  ← Load balancer + SSL
                    │ Load Balancer│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌────▼─────┐
        │ Express  │ │ Express  │ │ Express  │  ← API instances (auto-scale)
        │ Server 1 │ │ Server 2 │ │ Server 3 │
        └─────┬────┘ └────┬─────┘ └────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis     │  ← Queue + Cache + Socket.io sync
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌────▼─────┐
        │ Worker 1 │ │ Worker 2 │ │ Worker 3 │  ← Job processors
        └─────┬────┘ └────┬─────┘ └────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
   │    FFT     │    │ Liveness  │    │  LipSync  │  ← ML services
   │  Service   │    │  Service  │    │  Service  │
   └───────────┘    └───────────┘    └───────────┘
                           │
                    ┌──────▼──────┐
                    │   Supabase   │  ← Database + Storage + Auth
                    └─────────────┘
```

---

## 8. Implementation Priority Roadmap

### Priority 1 — Do Before Deployment (1-2 days)
| Task | Why |
|---|---|
| Rate limiting | Prevents abuse and DDoS |
| Helmet security headers | Basic attack protection |
| CORS lockdown | Restrict to your frontend domain only |
| Compression | Free performance boost |
| PM2 cluster mode | Multi-core utilization |

### Priority 2 — Do At Launch (3-5 days)
| Task | Why |
|---|---|
| Redis caching | Reduce database load |
| BullMQ job queue | Reliable background processing with retries |
| Docker + docker-compose | Consistent deployment across environments |
| Enhanced health check | Monitor DB connectivity |
| Production logging (file + monitoring) | Debug production issues |

### Priority 3 — Do When Growing (1-2 weeks)
| Task | Why |
|---|---|
| Socket.io Redis adapter | Multi-server Socket.io |
| Nginx load balancer | Distribute traffic |
| Direct-to-storage uploads | Eliminate server RAM bottleneck |
| Database connection pooling | Handle high concurrency |
| Auto-scaling (cloud) | Scale up/down based on traffic |

### Priority 4 — Do At Scale (ongoing)
| Task | Why |
|---|---|
| CDN | Cache frontend assets globally |
| Kubernetes/ECS | Container orchestration |
| APM (Datadog/New Relic) | Performance monitoring & alerting |
| Database read replicas | Separate read and write traffic |
| ML service auto-scaling | Scale GPU workers independently |

---

## Quick Reference: Libraries to Install

| Library | Purpose | Phase |
|---|---|---|
| `express-rate-limit` | API rate limiting | 1 |
| `helmet` | Security headers | 1 |
| `compression` | Gzip responses | 1 |
| `redis` | Caching + adapter | 2 |
| `bullmq` | Job queue | 2 |
| `@socket.io/redis-adapter` | Multi-server Socket.io | 3 |
| `pm2` | Process manager (global) | 1 |

---

> **Key Principle:** Scale horizontally (more servers) not vertically (bigger server). Add Redis as the central coordination layer. Use job queues for anything that takes more than a few seconds. Cache reads, queue writes.
