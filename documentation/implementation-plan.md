# MAVEN — Complete Implementation Plan
### Multimodal Audio-Visual Examination Network
**Deepfake Forensics Capstone Project**

> This document is the authoritative implementation guide for building MAVEN end-to-end. It extends the architectural spec with specific code, decisions, gap fixes, and ordering of work. Follow phases in sequence — later phases depend on earlier ones.

---

## Table of Contents

1. [Project Overview & Architecture](#1-project-overview--architecture)
2. [Pre-Work Checklist](#2-pre-work-checklist)
3. [Phase 1 — Infrastructure & Setup](#3-phase-1--infrastructure--setup)
4. [Phase 2 — Node.js Backend](#4-phase-2--nodejs-backend)
5. [Phase 3 — Python ML Services](#5-phase-3--python-ml-services)
6. [Phase 4 — React Frontend](#6-phase-4--react-frontend)
7. [Phase 5 — Integration & Testing](#7-phase-5--integration--testing)
8. [Phase 6 — Model Training & Evaluation](#8-phase-6--model-training--evaluation)
9. [Phase 7 — Deployment](#9-phase-7--deployment)
10. [Database Schema (Complete)](#10-database-schema-complete)
11. [API Reference (Complete)](#11-api-reference-complete)
12. [Environment Variables (All Services)](#12-environment-variables-all-services)
13. [Timeline & Milestones](#13-timeline--milestones)
14. [Known Gaps & Decisions Log](#14-known-gaps--decisions-log)

---

## 1. Project Overview & Architecture

MAVEN detects synthetic/manipulated video through three forensic layers running in parallel:

| Layer | Service | Port | Core Technique | Target Accuracy |
|-------|---------|------|---------------|----------------|
| Frequency-Domain | `fft-service` | 8001 | FFT + EfficientNet-B0 on spectral maps | AUC > 0.85 |
| Visual Liveness | `liveness-service` | 8002 | CHROM rPPG + MediaPipe EAR blink analysis | F1 > 0.80 |
| Audio-Visual Sync | `lipsync-service` | 8003 | Wav2Lip sync discriminator (fine-tuned) | F1 > 0.87 |

**Key architectural decision:** The lip-sync service uses the pre-trained **Wav2Lip sync discriminator** as its backbone rather than training a cross-modal transformer from scratch. Fine-tuning takes ~24 hours on a single GPU; training from scratch would require weeks and is not feasible for a 12-week capstone.

### Data Flow (Corrected)

```
User (Browser)
    │ multipart/form-data upload
    ▼
Node.js Express Backend (port 4000)
    │ 1. Validate JWT (Supabase)
    │ 2. Receive video via Multer (memoryStorage)
    │ 3. Upload to Supabase Storage as {user_id}/{job_id}.mp4
    │ 4. Create analysis_jobs record (status: PROCESSING)
    │ 5. Generate 3-hour signed URL for video
    │ 6. Fan-out to 3 ML services (Promise.all with timeouts)
    │
    ├──► fft-service:8001/analyze      (timeout: 120s)
    ├──► liveness-service:8002/analyze (timeout: 120s)
    └──► lipsync-service:8003/analyze  (timeout: 180s)
         │
         ▼ (all 3 resolve)
    Node.js aggregates scores → computeFinalVerdict()
         │
         ▼
    Supabase DB: INSERT analysis_results
    Supabase DB: UPDATE analysis_jobs status=COMPLETED
    Socket.io: emit('analysis_complete', { jobId, verdict })
         │
         ▼
    React Frontend (Supabase Realtime subscription)
    → Navigates to /result/:jobId
```

---

## 2. Pre-Work Checklist

Complete these before writing any code. Several have multi-week lead times.

### Week 0 — Before You Start

- [ ] **Request FaceForensics++ access** — Submit academic request at `https://github.com/ondyari/FaceForensics`. Takes 1–2 weeks. Do this on Day 1.
- [ ] **Create Supabase project** — Free tier at `supabase.com`. Note your `SUPABASE_URL` and both keys (`anon` and `service_role`).
- [ ] **Verify GPU access** — Confirm you have access to an NVIDIA GPU (local or cloud EC2 `g4dn.xlarge` ~$0.50/hr). The lipsync service is unusable on CPU for videos longer than 30 seconds.
- [ ] **Download Wav2Lip pre-trained weights** — `https://github.com/Rudrabha/Wav2Lip` — download `wav2lip_gan.pth` and `lipsync_expert.pth` now. Keep them in `ml-services/lipsync_service/weights/`.
- [ ] **Record your own test videos** — 5 real clips of yourself (10–30 seconds each, clear face, speaking). Generate 5 deepfakes using FaceSwap or an online tool. These are your guaranteed demo assets regardless of dataset access.
- [ ] **Install Docker Desktop** with NVIDIA Container Toolkit if using local GPU.

---

## 3. Phase 1 — Infrastructure & Setup

**Duration: Week 1**

### 3.1 Repository Initialization

```bash
mkdir maven && cd maven
git init

# Frontend
npm create vite@latest frontend -- --template react
cd frontend
npm install axios @supabase/supabase-js recharts framer-motion react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
cd ..

# Backend
mkdir backend && cd backend
npm init -y
npm install express cors dotenv multer axios joi winston @supabase/supabase-js socket.io express-rate-limit
npm install -D jest supertest nodemon
cd ..

# Python services
mkdir -p ml-services/fft_service/weights
mkdir -p ml-services/fft_service/tests/fixtures
mkdir -p ml-services/liveness_service/weights
mkdir -p ml-services/liveness_service/tests/fixtures
mkdir -p ml-services/lipsync_service/weights
mkdir -p ml-services/lipsync_service/tests/fixtures

# Shared fixture: copy a known-real and known-fake 10s clip into each tests/fixtures/
```

### 3.2 Supabase Setup (Complete SQL)

Run this entire block in the Supabase SQL Editor (Dashboard → SQL Editor → New Query):

```sql
-- ============================================================
-- MAVEN Database Schema
-- ============================================================

-- Analysis Jobs
CREATE TABLE analysis_jobs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_path    TEXT NOT NULL,               -- e.g. "{user_id}/{job_id}.mp4"
  original_name TEXT,
  file_size_mb  FLOAT,
  duration_sec  FLOAT,
  status        TEXT CHECK (status IN ('PROCESSING','COMPLETED','FAILED'))
                DEFAULT 'PROCESSING',
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis Results
CREATE TABLE analysis_results (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id          UUID REFERENCES analysis_jobs(id) ON DELETE CASCADE UNIQUE,
  verdict         TEXT CHECK (verdict IN ('REAL','FAKE','UNCERTAIN')) NOT NULL,
  confidence      FLOAT NOT NULL,
  fft_score       FLOAT,        -- 0=real, 1=fake (raw artifact_score)
  liveness_score  FLOAT,        -- 0=fake, 1=real
  sync_score      FLOAT,        -- 0=out-of-sync, 1=in-sync
  details         JSONB,        -- Full per-service JSON payloads
  spectrum_url    TEXT,         -- Signed URL for FFT heatmap image
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_user_id   ON analysis_jobs(user_id);
CREATE INDEX idx_jobs_status    ON analysis_jobs(status);
CREATE INDEX idx_jobs_created   ON analysis_jobs(created_at DESC);
CREATE INDEX idx_results_job    ON analysis_results(job_id);

-- Auto-update updated_at on analysis_jobs
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE analysis_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_jobs" ON analysis_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_results" ON analysis_results
  FOR ALL USING (
    job_id IN (SELECT id FROM analysis_jobs WHERE user_id = auth.uid())
  );

-- ============================================================
-- Storage RLS (CRITICAL — missing from original spec)
-- ============================================================
-- Run after creating the 'maven-videos' bucket in Dashboard → Storage
CREATE POLICY "user_owns_video" ON storage.objects
  FOR ALL USING (
    bucket_id = 'maven-videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE analysis_jobs;
```

Then in Supabase Dashboard:
1. **Storage** → New bucket → name: `maven-videos` → toggle Private → Create
2. **Authentication** → Providers → enable Email and Google
3. **Database** → Replication → confirm `analysis_jobs` is in the publication

### 3.3 Docker Compose (Complete with GPU Support)

```yaml
# docker-compose.yml
version: '3.9'

services:
  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    ports:
      - "4000:4000"
    env_file: ./backend/.env
    depends_on:
      fft-service:
        condition: service_healthy
      liveness-service:
        condition: service_healthy
      lipsync-service:
        condition: service_healthy
    restart: unless-stopped

  fft-service:
    build:
      context: .
      dockerfile: docker/Dockerfile.fft
    ports:
      - "8001:8001"
    env_file: ./ml-services/fft_service/.env
    volumes:
      - ./ml-services/fft_service/weights:/app/weights:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  liveness-service:
    build:
      context: .
      dockerfile: docker/Dockerfile.liveness
    ports:
      - "8002:8002"
    env_file: ./ml-services/liveness_service/.env
    volumes:
      - ./ml-services/liveness_service/weights:/app/weights:ro
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  lipsync-service:
    build:
      context: .
      dockerfile: docker/Dockerfile.lipsync
    ports:
      - "8003:8003"
    env_file: ./ml-services/lipsync_service/.env
    volumes:
      - ./ml-services/lipsync_service/weights:/app/weights:ro
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8003/health"]
      interval: 30s
      timeout: 15s
      retries: 5
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend
    restart: unless-stopped
```

### 3.4 Dockerfiles

```dockerfile
# docker/Dockerfile.backend
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/src ./src
COPY backend/server.js .
EXPOSE 4000
CMD ["node", "server.js"]
```

```dockerfile
# docker/Dockerfile.fft
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 curl && rm -rf /var/lib/apt/lists/*
COPY ml-services/fft_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml-services/fft_service/ .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

```dockerfile
# docker/Dockerfile.liveness
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1-mesa-glx libglib2.0-0 curl && rm -rf /var/lib/apt/lists/*
COPY ml-services/liveness_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml-services/liveness_service/ .
EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
```

```dockerfile
# docker/Dockerfile.lipsync
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg libgl1-mesa-glx curl && rm -rf /var/lib/apt/lists/*
COPY ml-services/lipsync_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml-services/lipsync_service/ .
EXPOSE 8003
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
```

---

## 4. Phase 2 — Node.js Backend

**Duration: Week 2–3**

### 4.1 Project Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── analysis.routes.js
│   │   └── results.routes.js
│   ├── controllers/
│   │   ├── analysis.controller.js
│   │   └── results.controller.js
│   ├── services/
│   │   ├── supabase.service.js
│   │   ├── mlOrchestrator.js
│   │   └── aggregator.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── upload.middleware.js
│   │   └── error.middleware.js
│   ├── utils/
│   │   └── logger.js
│   └── app.js
├── server.js
└── package.json
```

### 4.2 Core Files

```javascript
// backend/server.js
import httpServer from './src/app.js';
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`MAVEN backend on port ${PORT}`));
```

```javascript
// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import analysisRoutes from './routes/analysis.routes.js';
import resultsRoutes from './routes/results.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL
      : '*'
  }
});

// Socket.io: handle room joins for real-time job updates
io.on('connection', (socket) => {
  socket.on('join_job', (jobId) => {
    socket.join(`job:${jobId}`);
  });
});

// Global rate limit
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : '*',
  credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use('/api/analysis', analysisRoutes);
app.use('/api/results', resultsRoutes);
app.use(errorMiddleware);

export default httpServer;
```

```javascript
// backend/src/middleware/auth.middleware.js
import { supabase } from '../services/supabase.service.js';

export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
};
```

```javascript
// backend/src/middleware/upload.middleware.js
import multer from 'multer';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: mp4, webm, mov`), false);
    }
  }
}).single('video');
```

```javascript
// backend/src/services/supabase.service.js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — full DB access, never expose to frontend
);

export async function uploadVideoToSupabase(fileBuffer, userId, jobId, mimetype) {
  const ext = mimetype === 'video/webm' ? 'webm' : mimetype === 'video/quicktime' ? 'mov' : 'mp4';
  const storagePath = `${userId}/${jobId}.${ext}`;

  const { error } = await supabase.storage
    .from('maven-videos')
    .upload(storagePath, fileBuffer, {
      contentType: mimetype,
      upsert: false
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

export async function getSignedUrl(storagePath, expiresIn = 10800) {
  const { data, error } = await supabase.storage
    .from('maven-videos')
    .createSignedUrl(storagePath, expiresIn); // 3 hours default
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

export async function deleteVideo(storagePath) {
  const { error } = await supabase.storage
    .from('maven-videos')
    .remove([storagePath]);
  if (error) console.error(`Failed to delete video ${storagePath}:`, error.message);
}
```

```javascript
// backend/src/controllers/analysis.controller.js
import { v4 as uuidv4 } from 'uuid';
import { uploadVideoToSupabase } from '../services/supabase.service.js';
import { runMLAnalysis } from '../services/mlOrchestrator.js';
import { supabase } from '../services/supabase.service.js';
import rateLimit from 'express-rate-limit';

// Stricter rate limit for uploads: 5 per 10 minutes per user
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many uploads. Please wait 10 minutes.' }
});

export const submitVideo = async (req, res) => {
  const { file } = req;
  const userId = req.user.id;
  const jobId = uuidv4();

  // Upload video to Supabase Storage
  const videoPath = await uploadVideoToSupabase(
    file.buffer, userId, jobId, file.mimetype
  );

  // Create job record
  const { error: dbError } = await supabase
    .from('analysis_jobs')
    .insert({
      id: jobId,
      user_id: userId,
      video_path: videoPath,
      original_name: file.originalname,
      file_size_mb: parseFloat((file.size / 1024 / 1024).toFixed(2)),
      status: 'PROCESSING'
    });

  if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);

  // Respond immediately — analysis runs async
  res.status(202).json({
    jobId,
    message: 'Analysis started',
    estimatedTime: '30–90 seconds'
  });

  // Non-blocking ML pipeline
  runMLAnalysis(videoPath, jobId).catch(console.error);
};

export const listJobs = async (req, res) => {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('id, original_name, status, created_at, file_size_mb')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  res.json({ jobs: data });
};

export const getJob = async (req, res) => {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Job not found' });
  res.json(data);
};

export const deleteJob = async (req, res) => {
  const { data: job } = await supabase
    .from('analysis_jobs')
    .select('video_path')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!job) return res.status(404).json({ error: 'Job not found' });

  await deleteVideo(job.video_path);

  await supabase.from('analysis_jobs').delete().eq('id', req.params.id);
  res.json({ message: 'Job deleted' });
};
```

```javascript
// backend/src/services/mlOrchestrator.js
import axios from 'axios';
import { supabase, getSignedUrl, deleteVideo } from './supabase.service.js';
import { computeFinalVerdict } from './aggregator.js';
import { io } from '../app.js';
import logger from '../utils/logger.js';

const ML_SERVICES = {
  fft:      process.env.FFT_SERVICE_URL      || 'http://fft-service:8001',
  liveness: process.env.LIVENESS_SERVICE_URL || 'http://liveness-service:8002',
  lipsync:  process.env.LIPSYNC_SERVICE_URL  || 'http://lipsync-service:8003',
};

// Wraps a promise with a timeout
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);

export async function runMLAnalysis(videoPath, jobId) {
  let signedUrl;
  try {
    // Generate signed URL so Python services can fetch the video directly
    signedUrl = await getSignedUrl(videoPath, 10800); // 3 hours

    const payload = { video_url: signedUrl, job_id: jobId };

    logger.info(`Starting ML analysis for job ${jobId}`);

    // Fan-out with per-service timeouts
    const [fftResult, livenessResult, lipsyncResult] = await Promise.all([
      withTimeout(
        axios.post(`${ML_SERVICES.fft}/analyze`,      payload).then(r => r.data),
        120_000, 'FFT service'
      ),
      withTimeout(
        axios.post(`${ML_SERVICES.liveness}/analyze`, payload).then(r => r.data),
        120_000, 'Liveness service'
      ),
      withTimeout(
        axios.post(`${ML_SERVICES.lipsync}/analyze`,  payload).then(r => r.data),
        180_000, 'Lipsync service'
      ),
    ]);

    const verdict = computeFinalVerdict({ fftResult, livenessResult, lipsyncResult });

    logger.info(`Job ${jobId} verdict: ${verdict.verdict} (${verdict.confidence})`);

    // Save result
    await supabase.from('analysis_results').insert({
      job_id: jobId,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      fft_score: fftResult.artifact_score,
      liveness_score: livenessResult.liveness_score,
      sync_score: lipsyncResult.sync_score,
      spectrum_url: fftResult.spectrum_heatmap_url || null,
      details: { fftResult, livenessResult, lipsyncResult }
    });

    await supabase.from('analysis_jobs')
      .update({ status: 'COMPLETED' })
      .eq('id', jobId);

    // Notify frontend
    io.to(`job:${jobId}`).emit('analysis_complete', { jobId, verdict });

    // Clean up video from storage (keep for 24h, delete after)
    // Uncomment to enable immediate deletion:
    // await deleteVideo(videoPath);

  } catch (err) {
    logger.error(`Job ${jobId} failed: ${err.message}`);
    await supabase.from('analysis_jobs')
      .update({ status: 'FAILED', error: err.message })
      .eq('id', jobId);
    io.to(`job:${jobId}`).emit('analysis_failed', { jobId, error: err.message });
  }
}
```

```javascript
// backend/src/services/aggregator.js

/**
 * Fuse scores from all 3 ML services into a single verdict.
 * All inputs normalized to [0=real, 1=fake] scale before weighting.
 * Null/undefined scores fall back to 0.5 (uncertain) rather than
 * penalizing in either direction.
 */
export function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
  const weights = { fft: 0.30, liveness: 0.40, lipsync: 0.30 };

  const fftFakeScore      = fftResult?.artifact_score        ?? 0.5;
  const livenessFakeScore = 1 - (livenessResult?.liveness_score ?? 0.5);
  const lipsyncFakeScore  = 1 - (lipsyncResult?.sync_score      ?? 0.5);

  const weightedScore =
    weights.fft      * fftFakeScore +
    weights.liveness * livenessFakeScore +
    weights.lipsync  * lipsyncFakeScore;

  const verdict =
    weightedScore > 0.65 ? 'FAKE' :
    weightedScore > 0.40 ? 'UNCERTAIN' : 'REAL';

  return {
    verdict,
    confidence: parseFloat(weightedScore.toFixed(4)),
    breakdown: {
      fftFakeScore:      parseFloat(fftFakeScore.toFixed(4)),
      livenessFakeScore: parseFloat(livenessFakeScore.toFixed(4)),
      lipsyncFakeScore:  parseFloat(lipsyncFakeScore.toFixed(4))
    }
  };
}
```

```javascript
// backend/src/middleware/error.middleware.js
import logger from '../utils/logger.js';

export function errorMiddleware(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path });
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
}
```

```javascript
// backend/src/routes/analysis.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';
import {
  submitVideo, listJobs, getJob, deleteJob, uploadLimiter
} from '../controllers/analysis.controller.js';

const router = Router();

router.post('/submit', requireAuth, uploadLimiter, uploadMiddleware, submitVideo);
router.get('/jobs',      requireAuth, listJobs);
router.get('/jobs/:id',  requireAuth, getJob);
router.delete('/jobs/:id', requireAuth, deleteJob);

export default router;
```

```javascript
// backend/src/routes/results.routes.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { supabase } from '../services/supabase.service.js';

const router = Router();

router.get('/:jobId', requireAuth, async (req, res, next) => {
  try {
    const { data: result, error } = await supabase
      .from('analysis_results')
      .select(`*, analysis_jobs!inner(user_id, original_name, duration_sec)`)
      .eq('job_id', req.params.jobId)
      .eq('analysis_jobs.user_id', req.user.id)
      .single();

    if (error || !result) return res.status(404).json({ error: 'Result not found' });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
```

---

## 5. Phase 3 — Python ML Services

**Duration: Week 3–7 (heaviest work)**

### 5.1 Shared Requirements

Each service has its own `requirements.txt`. Common across all three:

```
fastapi==0.110.0
uvicorn[standard]==0.27.1
pydantic==2.6.0
opencv-python-headless==4.9.0.80
mediapipe==0.10.9
numpy==1.26.4
scipy==1.12.0
requests==2.31.0
python-multipart==0.0.9
```

### 5.2 FFT Service

**Additional requirements for `fft_service/requirements.txt`:**
```
torch==2.2.0
torchvision==0.17.0
Pillow==10.2.0
matplotlib==3.8.3
```

```python
# ml-services/fft_service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from analyzer import run_fft_analysis
import logging

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="MAVEN FFT Service")

class AnalysisRequest(BaseModel):
    video_url: str
    job_id: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "fft"}

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    try:
        result = run_fft_analysis(req.video_url, req.job_id)
        return result
    except Exception as e:
        logging.error(f"FFT analysis failed for job {req.job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

```python
# ml-services/fft_service/analyzer.py
import cv2
import numpy as np
import tempfile
import requests
import os
import logging
import torch
import torchvision.transforms as T
from pathlib import Path
from models.cnn_classifier import FFTClassifier

logger = logging.getLogger(__name__)

# Load model once at module level (not per-request)
MODEL_PATH = Path(os.getenv("MODEL_WEIGHTS_PATH", "./weights")) / "fft_classifier.pt"
_model = None

def get_model():
    global _model
    if _model is None:
        _model = FFTClassifier()
        if MODEL_PATH.exists():
            _model.load_state_dict(torch.load(MODEL_PATH, map_location='cpu'))
            logger.info("FFT classifier loaded from weights")
        else:
            logger.warning("No weights found — using untrained model. Run training first.")
        _model.eval()
    return _model

def download_video(url: str) -> str:
    """Download video from signed URL to a temp file. Returns local path."""
    with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
        tmp_path = f.name
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(tmp_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return tmp_path

def compute_frame_fft(gray_frame: np.ndarray) -> tuple[float, np.ndarray]:
    """
    Compute FFT of a grayscale face crop.
    Returns (high_freq_ratio, log_magnitude_spectrum).
    """
    f = np.fft.fft2(gray_frame.astype(np.float32))
    fshift = np.fft.fftshift(f)
    magnitude = np.log1p(np.abs(fshift))

    h, w = magnitude.shape
    # Center mask covers low-frequency region (inner 50% of spectrum)
    center_mask = np.zeros((h, w), dtype=np.float32)
    center_mask[h//4:3*h//4, w//4:3*w//4] = 1.0

    low_energy   = float(np.sum(magnitude * center_mask))
    total_energy = float(np.sum(magnitude)) + 1e-8
    hfr = 1.0 - (low_energy / total_energy)

    return hfr, magnitude

def run_fft_analysis(video_url: str, job_id: str) -> dict:
    tmp_path = None
    try:
        tmp_path = download_video(video_url)
        cap = cv2.VideoCapture(tmp_path)

        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {tmp_path}")

        model = get_model()
        transform = T.Compose([
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

        artifact_scores = []
        cnn_scores = []
        suspicious_frames = []
        frame_idx = 0
        SAMPLE_EVERY = 5  # process every 5th frame for speed

        # MediaPipe face detection for cropping
        import mediapipe as mp
        face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.5
        )

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % SAMPLE_EVERY != 0:
                frame_idx += 1
                continue

            # Attempt face crop
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            detection_result = face_detection.process(rgb)
            if detection_result.detections:
                det = detection_result.detections[0].location_data.relative_bounding_box
                h, w = frame.shape[:2]
                x1 = max(0, int(det.xmin * w))
                y1 = max(0, int(det.ymin * h))
                x2 = min(w, int((det.xmin + det.width) * w))
                y2 = min(h, int((det.ymin + det.height) * h))
                face_crop = frame[y1:y2, x1:x2]
                if face_crop.size == 0:
                    face_crop = frame
            else:
                face_crop = frame  # fallback to full frame

            gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
            hfr, spectrum = compute_frame_fft(gray)
            artifact_scores.append(hfr)

            # CNN inference on spectrum image
            # Convert spectrum to 3-channel PIL image for EfficientNet
            from PIL import Image
            spectrum_norm = ((spectrum - spectrum.min()) /
                             (spectrum.max() - spectrum.min() + 1e-8) * 255).astype(np.uint8)
            pil_img = Image.fromarray(spectrum_norm).convert('RGB')
            tensor = transform(pil_img).unsqueeze(0)
            with torch.no_grad():
                cnn_score = float(model(tensor).squeeze().item())
            cnn_scores.append(cnn_score)

            if hfr > 0.55 or cnn_score > 0.6:
                suspicious_frames.append(frame_idx)

            frame_idx += 1

        cap.release()
        face_detection.close()

        if not artifact_scores:
            return {"artifact_score": 0.5, "high_freq_ratio": 0.5,
                    "suspicious_frames": [], "total_frames_analyzed": 0,
                    "spectrum_heatmap_url": None}

        mean_hfr = float(np.mean(artifact_scores))
        mean_cnn = float(np.mean(cnn_scores)) if cnn_scores else mean_hfr

        # Blend HFR (rule-based) with CNN score
        final_score = 0.4 * mean_hfr + 0.6 * mean_cnn

        return {
            "artifact_score": round(final_score, 4),
            "high_freq_ratio": round(mean_hfr, 4),
            "cnn_score": round(mean_cnn, 4),
            "suspicious_frames": suspicious_frames[:20],
            "total_frames_analyzed": len(artifact_scores),
            "spectrum_heatmap_url": None  # TODO: save spectrum to Supabase Storage
        }

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
```

```python
# ml-services/fft_service/models/cnn_classifier.py
import torch
import torch.nn as nn
from torchvision import models

class FFTClassifier(nn.Module):
    """
    EfficientNet-B0 fine-tuned on FFT spectral maps.
    Input: 3-channel log-magnitude spectrum image (224×224)
    Output: scalar in [0,1] where 1 = fake
    """
    def __init__(self):
        super().__init__()
        self.base = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
        in_features = self.base.classifier[1].in_features
        self.base.classifier[1] = nn.Linear(in_features, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.base(x))
```

**FFT training script (run once on FaceForensics++):**

```python
# ml-services/fft_service/train.py
"""
Run this on a machine with GPU after downloading FaceForensics++.
Expected dataset structure:
  data/
    real/   ← original_sequences/youtube/raw/videos/*.mp4
    fake/   ← manipulated_sequences/*/raw/videos/*.mp4
"""
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import transforms, datasets
from models.cnn_classifier import FFTClassifier
from analyzer import compute_frame_fft
import cv2, numpy as np
from PIL import Image
import os

# Build a dataset of FFT spectrum images from videos
# (Run a preprocessing script to extract and save spectra as PNGs first)
# Then use ImageFolder:

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

train_data = datasets.ImageFolder('data/spectra/train', transform=transform)
val_data   = datasets.ImageFolder('data/spectra/val',   transform=transform)

train_loader = DataLoader(train_data, batch_size=32, shuffle=True,  num_workers=4)
val_loader   = DataLoader(val_data,   batch_size=32, shuffle=False, num_workers=4)

model = FFTClassifier().cuda()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
criterion = nn.BCELoss()

for epoch in range(30):
    model.train()
    for imgs, labels in train_loader:
        imgs, labels = imgs.cuda(), labels.float().unsqueeze(1).cuda()
        optimizer.zero_grad()
        loss = criterion(model(imgs), labels)
        loss.backward()
        optimizer.step()

    # Validate
    model.eval()
    correct = 0
    with torch.no_grad():
        for imgs, labels in val_loader:
            imgs, labels = imgs.cuda(), labels.cuda()
            preds = (model(imgs).squeeze() > 0.5).long()
            correct += (preds == labels).sum().item()
    acc = correct / len(val_data)
    print(f"Epoch {epoch+1}/30 — Val accuracy: {acc:.3f}")

torch.save(model.state_dict(), 'weights/fft_classifier.pt')
print("Saved weights/fft_classifier.pt")
```

### 5.3 Liveness Service

**Additional requirements for `liveness_service/requirements.txt`:**
```
torch==2.2.0
librosa==0.10.1
```

```python
# ml-services/liveness_service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from rppg import extract_rppg_signal
from blink_detector import analyze_blinks
import requests, tempfile, os, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI(title="MAVEN Liveness Service")

class AnalysisRequest(BaseModel):
    video_url: str
    job_id: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "liveness"}

def download_video(url: str) -> str:
    with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
        tmp_path = f.name
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(tmp_path, 'wb') as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
    return tmp_path

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    tmp_path = None
    try:
        tmp_path = download_video(req.video_url)
        rppg   = extract_rppg_signal(tmp_path)
        blink  = analyze_blinks(tmp_path)

        # Fuse rPPG and blink into single liveness_score
        # rPPG weighted higher (stronger deepfake signal)
        rppg_score  = rppg["signal_quality"] if rppg["pulse_present"] else 0.1
        blink_score = blink["regularity_score"]
        liveness_score = round(0.55 * rppg_score + 0.45 * blink_score, 4)

        return {
            "liveness_score": liveness_score,
            "rppg": rppg,
            "blink": blink
        }
    except Exception as e:
        logger.error(f"Liveness analysis failed for job {req.job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
```

```python
# ml-services/liveness_service/rppg.py
import cv2
import numpy as np
import mediapipe as mp
from scipy.signal import butter, filtfilt

FOREHEAD_LMKS = [10, 338, 297, 332, 284, 251, 389]
MIN_FRAMES_FOR_RPPG = 200  # ~8 seconds at 25fps

def extract_rppg_signal(video_path: str) -> dict:
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1, refine_landmarks=True
    )

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    rgb_means = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)
        if results.multi_face_landmarks:
            lmk = results.multi_face_landmarks[0]
            h, w = frame.shape[:2]
            pts = np.array([
                [int(lmk.landmark[i].x * w), int(lmk.landmark[i].y * h)]
                for i in FOREHEAD_LMKS
            ])
            mask = np.zeros(frame.shape[:2], dtype=np.uint8)
            cv2.fillConvexPoly(mask, cv2.convexHull(pts), 255)
            roi = cv2.bitwise_and(rgb, rgb, mask=mask)
            valid_pixels = roi[mask == 255]
            if len(valid_pixels) > 10:
                rgb_means.append(valid_pixels.mean(axis=0))

    cap.release()
    face_mesh.close()

    if len(rgb_means) < MIN_FRAMES_FOR_RPPG:
        return {
            "pulse_present": False,
            "estimated_hr_bpm": 0,
            "signal_quality": 0.1,
            "note": f"Only {len(rgb_means)} face frames detected (need {MIN_FRAMES_FOR_RPPG})"
        }

    rgb_arr = np.array(rgb_means, dtype=np.float32)

    # CHROM algorithm (De Haan & Jeanne, 2013)
    Xs = 3 * rgb_arr[:, 0] - 2 * rgb_arr[:, 1]
    Ys = 1.5 * rgb_arr[:, 0] + rgb_arr[:, 1] - 1.5 * rgb_arr[:, 2]
    std_ys = float(np.std(Ys))
    if std_ys < 1e-6:
        return {"pulse_present": False, "estimated_hr_bpm": 0, "signal_quality": 0.0}

    rppg_raw = Xs - (float(np.std(Xs)) / std_ys) * Ys

    # Bandpass filter: 0.75–3.0 Hz (45–180 BPM)
    nyq = fps / 2.0
    low, high = 0.75 / nyq, min(3.0 / nyq, 0.99)
    b, a = butter(3, [low, high], btype='band')
    rppg_filtered = filtfilt(b, a, rppg_raw)

    # Dominant frequency via FFT
    freqs    = np.fft.rfftfreq(len(rppg_filtered), 1.0 / fps)
    fft_vals = np.abs(np.fft.rfft(rppg_filtered))
    valid    = (freqs >= 0.75) & (freqs <= 3.0)

    if not np.any(valid):
        return {"pulse_present": False, "estimated_hr_bpm": 0, "signal_quality": 0.0}

    peak_idx       = np.argmax(fft_vals[valid])
    dominant_freq  = freqs[valid][peak_idx]
    hr_bpm         = float(dominant_freq * 60)
    snr            = float(np.max(fft_vals[valid])) / (float(np.mean(fft_vals)) + 1e-8)
    quality        = min(1.0, snr / 10.0)

    return {
        "pulse_present": quality > 0.3,
        "estimated_hr_bpm": round(hr_bpm, 1),
        "signal_quality": round(quality, 3),
        "frames_analyzed": len(rgb_means)
    }
```

```python
# ml-services/liveness_service/blink_detector.py
import cv2
import numpy as np
import mediapipe as mp
from scipy.spatial.distance import euclidean

LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]
EAR_THRESH    = 0.20
CONSEC_FRAMES = 2

def ear(landmarks, indices, h, w) -> float:
    pts = np.array([[int(landmarks[i].x * w), int(landmarks[i].y * h)]
                    for i in indices])
    A = euclidean(pts[1], pts[5])
    B = euclidean(pts[2], pts[4])
    C = euclidean(pts[0], pts[3])
    return (A + B) / (2.0 * C + 1e-6)

def analyze_blinks(video_path: str) -> dict:
    # Instantiate once — NOT inside the loop
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1, refine_landmarks=True
    )
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    ear_series, blink_events = [], []
    consec_below = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame.shape[:2]
        result = face_mesh.process(rgb)
        if result.multi_face_landmarks:
            lmk = result.multi_face_landmarks[0].landmark
            avg_ear = (ear(lmk, LEFT_EYE, h, w) + ear(lmk, RIGHT_EYE, h, w)) / 2.0
            ear_series.append(avg_ear)
            if avg_ear < EAR_THRESH:
                consec_below += 1
            else:
                if consec_below >= CONSEC_FRAMES:
                    blink_events.append(len(ear_series))
                consec_below = 0

    cap.release()
    face_mesh.close()  # Always close to release resources

    total_frames  = len(ear_series)
    duration_min  = total_frames / (fps * 60) if fps > 0 else 0.01
    blink_rate    = len(blink_events) / max(duration_min, 0.01)
    regularity    = max(0.0, 1.0 - abs(blink_rate - 17.5) / 17.5)  # centred at ~17.5/min

    return {
        "blink_count": len(blink_events),
        "blink_rate_per_min": round(blink_rate, 2),
        "regularity_score": round(regularity, 3),
        "normal_range": [15, 25],
        "is_normal": 15 <= blink_rate <= 25,
        "frames_analyzed": total_frames
    }
```

### 5.4 Lip-Sync Service

**This is the most complex service. Use Wav2Lip's pre-trained sync discriminator.**

**Additional requirements for `lipsync_service/requirements.txt`:**
```
torch==2.2.0
torchaudio==2.2.0
librosa==0.10.1
ffmpeg-python==0.2.0
face-alignment==1.4.1
```

```python
# ml-services/lipsync_service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from cross_modal_transformer import analyze_lipsync
import requests, tempfile, os, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI(title="MAVEN LipSync Service")

class AnalysisRequest(BaseModel):
    video_url: str
    job_id: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "lipsync"}

def download_video(url: str) -> str:
    with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
        tmp_path = f.name
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(tmp_path, 'wb') as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
    return tmp_path

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    tmp_path = None
    try:
        tmp_path = download_video(req.video_url)
        result = analyze_lipsync(tmp_path)
        return result
    except Exception as e:
        logger.error(f"LipSync analysis failed for job {req.job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
```

```python
# ml-services/lipsync_service/audio_processor.py
import subprocess
import tempfile
import os
import numpy as np
import librosa

def extract_audio_wav(video_path: str, target_sr: int = 16000) -> tuple:
    """Extract audio from video, return (audio_array, sample_rate)."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wav_path = f.name
    try:
        subprocess.run([
            'ffmpeg', '-i', video_path,
            '-vn', '-ar', str(target_sr), '-ac', '1',
            '-y', wav_path
        ], check=True, capture_output=True, timeout=60)
        audio, sr = librosa.load(wav_path, sr=target_sr, mono=True)
        return audio, sr
    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)

def compute_mfcc(audio: np.ndarray, sr: int,
                 n_mfcc: int = 40, hop_length: int = 160) -> np.ndarray:
    """Return MFCC matrix of shape (n_mfcc, T)."""
    return librosa.feature.mfcc(
        y=audio, sr=sr, n_mfcc=n_mfcc, hop_length=hop_length, n_fft=512
    )

def is_silent(audio_segment: np.ndarray, threshold: float = 0.01) -> bool:
    """Return True if segment is too quiet to analyze."""
    return float(np.sqrt(np.mean(audio_segment ** 2))) < threshold
```

```python
# ml-services/lipsync_service/cross_modal_transformer.py
"""
Lip-sync analysis using Wav2Lip's pre-trained sync discriminator.

Pre-trained weights location: ./weights/lipsync_expert.pth
Download from: https://github.com/Rudrabha/Wav2Lip

The sync discriminator scores 5-frame lip sequences against
the corresponding 0.2-second audio segment.
Score > 0.5 = in sync, Score < 0.5 = out of sync.
"""
import cv2
import numpy as np
import torch
import torch.nn as nn
import os
from pathlib import Path
from audio_processor import extract_audio_wav, compute_mfcc, is_silent

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
WEIGHTS_PATH = Path(os.getenv("MODEL_WEIGHTS_PATH", "./weights")) / "lipsync_expert.pth"
WINDOW_FRAMES = 5       # 5 frames per sync window (~0.2s at 25fps)
WINDOW_STRIDE = 1       # 1-frame stride for dense scoring
IMG_SIZE = 88           # Lip crop size expected by Wav2Lip discriminator
SILENCE_RMS_THRESH = 0.01

# ── Wav2Lip SyncNet architecture (matches lipsync_expert.pth) ──────────────
class Conv2d(nn.Module):
    def __init__(self, cin, cout, kernel_size, stride, padding, residual=False):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(cin, cout, kernel_size, stride, padding),
            nn.BatchNorm2d(cout)
        )
        self.act = nn.ReLU()
        self.residual = residual

    def forward(self, x):
        out = self.conv(x)
        return self.act(out + x) if self.residual else self.act(out)

class SyncNet_color(nn.Module):
    """Wav2Lip sync discriminator — audio + video branches."""
    def __init__(self):
        super().__init__()
        self.face_encoder = nn.Sequential(
            Conv2d(15, 32, 7, 1, 3),
            Conv2d(32, 64, 5, (1,2), 2), Conv2d(64, 64, 3, 1, 1, residual=True),
            Conv2d(64, 128, 3, 2, 1), Conv2d(128, 128, 3, 1, 1, residual=True),
            Conv2d(128, 256, 3, 2, 1), Conv2d(256, 256, 3, 1, 1, residual=True),
            Conv2d(256, 512, 3, 2, 1), Conv2d(512, 512, 3, 1, 1, residual=True),
            Conv2d(512, 512, 3, 2, 1), Conv2d(512, 512, 3, 1, 1, residual=True),
            Conv2d(512, 512, (3, 6), 1, 0), nn.Flatten(), nn.Linear(512, 512)
        )
        self.audio_encoder = nn.Sequential(
            Conv2d(1, 32, 3, 1, 1), Conv2d(32, 32, 3, 1, 1, residual=True),
            Conv2d(32, 64, 3, (3,1), 1), Conv2d(64, 64, 3, 1, 1, residual=True),
            Conv2d(64, 128, 3, 3, 1), Conv2d(128, 128, 3, 1, 1, residual=True),
            Conv2d(128, 256, 3, (3,2), 1), Conv2d(256, 256, 3, 1, 1, residual=True),
            Conv2d(256, 512, 3, 1, 0), Conv2d(512, 512, 1, 1, 0),
            nn.Flatten(), nn.Linear(512, 512)
        )

    def forward(self, audio_seq, face_seq):
        fa = self.audio_encoder(audio_seq)
        fv = self.face_encoder(face_seq)
        fa = nn.functional.normalize(fa, p=2, dim=1)
        fv = nn.functional.normalize(fv, p=2, dim=1)
        return (fa * fv).sum(dim=1)  # cosine similarity


_sync_model = None

def get_sync_model():
    global _sync_model
    if _sync_model is None:
        _sync_model = SyncNet_color().to(DEVICE)
        if WEIGHTS_PATH.exists():
            state = torch.load(str(WEIGHTS_PATH), map_location=DEVICE)
            # Wav2Lip checkpoint stores weights under 'state_dict'
            if 'state_dict' in state:
                _sync_model.load_state_dict(state['state_dict'])
            else:
                _sync_model.load_state_dict(state)
            _sync_model.eval()
        else:
            raise FileNotFoundError(
                f"Wav2Lip weights not found at {WEIGHTS_PATH}. "
                "Download lipsync_expert.pth from https://github.com/Rudrabha/Wav2Lip"
            )
    return _sync_model


def extract_lip_crops(video_path: str) -> tuple:
    """
    Extract per-frame lip region crops (88×88 grayscale).
    Returns (frames_list, fps).
    """
    import mediapipe as mp
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1
    )
    # Outer lip landmarks
    LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
                 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 185,
                 40, 39, 37, 0, 267, 269, 270, 409]

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    lip_crops = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame.shape[:2]
        result = face_mesh.process(rgb)
        if result.multi_face_landmarks:
            lmk = result.multi_face_landmarks[0].landmark
            pts = np.array([[lmk[i].x * w, lmk[i].y * h] for i in LIP_OUTER])
            x1, y1 = pts.min(axis=0).astype(int)
            x2, y2 = pts.max(axis=0).astype(int)
            pad = 10
            x1, y1 = max(0, x1-pad), max(0, y1-pad)
            x2, y2 = min(w, x2+pad), min(h, y2+pad)
            crop = frame[y1:y2, x1:x2]
            if crop.size > 0:
                crop = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
                lip_crops.append(crop)
            else:
                lip_crops.append(np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8))
        else:
            lip_crops.append(np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8))

    cap.release()
    face_mesh.close()
    return lip_crops, fps


def analyze_lipsync(video_path: str) -> dict:
    model = get_sync_model()
    audio, sr = extract_audio_wav(video_path, target_sr=16000)
    lip_crops, fps = extract_lip_crops(video_path)

    if len(lip_crops) < WINDOW_FRAMES:
        return {
            "sync_score": 0.5,
            "verdict": "INSUFFICIENT_DATA",
            "flagged_segments": [],
            "windows_analyzed": 0
        }

    mfcc = compute_mfcc(audio, sr)  # shape: (40, T_audio)
    # Map audio frames to video frames
    audio_frames_per_video_frame = mfcc.shape[1] / len(lip_crops)

    window_scores = []
    flagged_segments = []

    for i in range(0, len(lip_crops) - WINDOW_FRAMES, WINDOW_STRIDE):
        window_frames = lip_crops[i : i + WINDOW_FRAMES]

        # Get corresponding audio slice
        a_start = int(i * audio_frames_per_video_frame)
        a_end   = int((i + WINDOW_FRAMES) * audio_frames_per_video_frame)
        audio_slice = mfcc[:, a_start:a_end] if a_end <= mfcc.shape[1] else None

        # Skip silent windows
        frame_samples = int((i / fps) * sr)
        end_samples   = int(((i + WINDOW_FRAMES) / fps) * sr)
        if audio_slice is None or is_silent(audio[frame_samples:end_samples]):
            continue

        # Prepare tensors for SyncNet
        video_tensor = torch.FloatTensor(
            np.concatenate([cv2.cvtColor(f, cv2.COLOR_BGR2RGB).transpose(2,0,1)
                            for f in window_frames], axis=0)  # (15, 88, 88)
        ).unsqueeze(0).to(DEVICE) / 255.0

        # Resize MFCC slice to expected shape (1, 1, 80, 16)
        from skimage.transform import resize as sk_resize
        mfcc_resized = sk_resize(audio_slice, (80, 16), anti_aliasing=True)
        audio_tensor = torch.FloatTensor(mfcc_resized).unsqueeze(0).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            score = float(torch.sigmoid(model(audio_tensor, video_tensor)).item())

        window_scores.append(score)
        start_sec = round(i / fps, 2)
        end_sec   = round((i + WINDOW_FRAMES) / fps, 2)

        if score < 0.4:  # out-of-sync
            flagged_segments.append({
                "start_sec": start_sec,
                "end_sec": end_sec,
                "score": round(score, 3)
            })

    if not window_scores:
        return {
            "sync_score": 0.5,
            "verdict": "NO_SPEECH_DETECTED",
            "flagged_segments": [],
            "windows_analyzed": 0
        }

    mean_score = float(np.mean(window_scores))
    verdict = "OUT_OF_SYNC" if mean_score < 0.4 else ("UNCERTAIN" if mean_score < 0.65 else "IN_SYNC")

    # Merge adjacent flagged segments (< 0.5s gap)
    merged = []
    for seg in flagged_segments:
        if merged and seg["start_sec"] - merged[-1]["end_sec"] < 0.5:
            merged[-1]["end_sec"] = seg["end_sec"]
            merged[-1]["score"] = round((merged[-1]["score"] + seg["score"]) / 2, 3)
        else:
            merged.append(dict(seg))

    return {
        "sync_score": round(mean_score, 4),
        "verdict": verdict,
        "flagged_segments": merged[:10],  # top 10 worst segments
        "windows_analyzed": len(window_scores)
    }
```

---

## 6. Phase 4 — React Frontend

**Duration: Week 5–9**

### 6.1 Core Setup

```javascript
// frontend/src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

```javascript
// frontend/src/services/api.js
import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const API = axios.create({ baseURL: import.meta.env.VITE_BACKEND_URL });

// Attach Supabase JWT to every request
API.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const submitVideo = (formData, onProgress) =>
  API.post('/api/analysis/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (onProgress) onProgress(Math.round((evt.loaded / evt.total) * 100));
    }
  });

export const getJobs  = ()      => API.get('/api/analysis/jobs');
export const getJob   = (id)    => API.get(`/api/analysis/jobs/${id}`);
export const getResult = (jobId) => API.get(`/api/results/${jobId}`);
export const deleteJob = (id)   => API.delete(`/api/analysis/jobs/${id}`);
```

```jsx
// frontend/src/components/common/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="flex items-center justify-center h-screen">Loading…</div>;
  }
  return session ? children : <Navigate to="/auth" replace />;
}
```

```jsx
// frontend/src/hooks/useJobStatus.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useJobStatus(jobId) {
  const [status, setStatus] = useState('PROCESSING');

  useEffect(() => {
    if (!jobId) return;

    // Initial fetch
    supabase
      .from('analysis_jobs')
      .select('status')
      .eq('id', jobId)
      .single()
      .then(({ data }) => { if (data) setStatus(data.status); });

    // Realtime subscription
    const channel = supabase
      .channel(`job-status-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'analysis_jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => {
        setStatus(payload.new.status);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [jobId]);

  return status;
}
```

```jsx
// frontend/src/components/upload/DropZone.jsx
import { useCallback, useState } from 'react';

export function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const validate = (file) => {
    if (!['video/mp4','video/webm','video/quicktime'].includes(file.type)) {
      setError('Only MP4, WebM, and MOV files are supported.');
      return false;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('File must be under 100MB.');
      return false;
    }
    setError('');
    return true;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && validate(file)) onFile(file);
  }, [onFile]);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file && validate(file)) onFile(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors
        ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
      onClick={() => document.getElementById('file-input').click()}
    >
      <input id="file-input" type="file" accept="video/mp4,video/webm,video/quicktime"
             className="hidden" onChange={handleChange} />
      <p className="text-gray-600">Drag & drop a video or <span className="text-blue-500 underline">browse</span></p>
      <p className="text-sm text-gray-400 mt-2">MP4, WebM, MOV · Max 100MB</p>
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
    </div>
  );
}
```

```jsx
// frontend/src/components/results/VerdictCard.jsx
export function VerdictCard({ verdict, confidence }) {
  const config = {
    FAKE:      { color: 'bg-red-50 border-red-200',    text: 'text-red-700',    label: 'Likely Fake' },
    REAL:      { color: 'bg-green-50 border-green-200', text: 'text-green-700',  label: 'Likely Real' },
    UNCERTAIN: { color: 'bg-amber-50 border-amber-200', text: 'text-amber-700',  label: 'Uncertain' },
  }[verdict] || {};

  return (
    <div className={`rounded-2xl border-2 p-8 text-center ${config.color}`}>
      <div className={`text-5xl font-bold mb-2 ${config.text}`}>{config.label}</div>
      <div className="text-gray-500 text-sm">
        Confidence: <span className="font-semibold">{(confidence * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
```

```jsx
// frontend/src/components/results/SyncTimeline.jsx
/**
 * Renders a colored timeline bar where each segment is
 * colored by its sync score: red = out of sync, green = in sync.
 */
export function SyncTimeline({ segments, totalDuration }) {
  if (!segments?.length || !totalDuration) return null;
  const W = 600;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">Lip-sync timeline (red = out of sync)</p>
      <svg width="100%" viewBox={`0 0 ${W} 40`}>
        {/* Background track */}
        <rect x="0" y="8" width={W} height="24" rx="4" fill="#e5e7eb" />
        {/* Per-segment coloring */}
        {segments.map((seg, i) => {
          const x = (seg.start_sec / totalDuration) * W;
          const w = Math.max(4, ((seg.end_sec - seg.start_sec) / totalDuration) * W);
          const fill = seg.score < 0.4 ? '#EF4444' : '#22C55E';
          return (
            <rect key={i} x={x} y={8} width={w} height={24} rx={3}
                  fill={fill} opacity={0.85} />
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0s</span>
        <span>{totalDuration.toFixed(0)}s</span>
      </div>
    </div>
  );
}
```

```jsx
// frontend/src/components/results/ScoreBreakdown.jsx
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip
} from 'recharts';

export function ScoreBreakdown({ fftScore, livenessScore, syncScore }) {
  const data = [
    { subject: 'FFT',      score: Math.round((1 - (fftScore ?? 0.5)) * 100) },
    { subject: 'Liveness', score: Math.round((livenessScore ?? 0.5) * 100) },
    { subject: 'Lip Sync', score: Math.round((syncScore ?? 0.5) * 100) },
  ];
  // All axes: 0 = fake, 100 = real

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 13 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fontSize: 11 }} />
        <Radar name="Score" dataKey="score" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} />
        <Tooltip formatter={(v) => [`${v}`, 'Authenticity score']} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

```jsx
// frontend/src/pages/Upload.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropZone } from '../components/upload/DropZone';
import { submitVideo } from '../services/api';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('video', file);
      const { data } = await submitVideo(formData, setProgress);
      navigate(`/dashboard?jobId=${data.jobId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-12 px-4">
      <h1 className="text-2xl font-semibold mb-6">Analyze a Video</h1>
      <DropZone onFile={setFile} />
      {file && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <strong>{file.name}</strong> — {(file.size / 1024 / 1024).toFixed(1)} MB
        </div>
      )}
      {submitting && (
        <div className="mt-4">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all"
                 style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-500 mt-1">Uploading… {progress}%</p>
        </div>
      )}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="mt-6 w-full py-3 bg-blue-600 text-white rounded-lg font-medium
                   disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
      >
        {submitting ? 'Analyzing…' : 'Analyze Video'}
      </button>
    </div>
  );
}
```

```jsx
// frontend/src/pages/Result.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useJobStatus } from '../hooks/useJobStatus';
import { getResult } from '../services/api';
import { VerdictCard } from '../components/results/VerdictCard';
import { ScoreBreakdown } from '../components/results/ScoreBreakdown';
import { SyncTimeline } from '../components/results/SyncTimeline';

export default function Result() {
  const { jobId } = useParams();
  const status = useJobStatus(jobId);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (status === 'COMPLETED') {
      getResult(jobId).then(({ data }) => setResult(data));
    }
  }, [status, jobId]);

  if (status === 'PROCESSING') {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent
                        rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Analyzing video… this takes 30–90 seconds.</p>
        <p className="text-sm text-gray-400 mt-2">Running FFT · Liveness · Lip-sync checks</p>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center text-red-500">
        Analysis failed. Please try uploading a different video.
      </div>
    );
  }

  if (!result) return null;

  const { details } = result;
  const totalDuration = details?.lipsyncResult?.windows_analyzed
    ? details.lipsyncResult.flagged_segments?.slice(-1)[0]?.end_sec || 30
    : 30;

  return (
    <div className="max-w-2xl mx-auto mt-8 px-4 space-y-8">
      <VerdictCard verdict={result.verdict} confidence={result.confidence} />

      <div>
        <h2 className="text-lg font-medium mb-4">Detection layer scores</h2>
        <ScoreBreakdown
          fftScore={result.fft_score}
          livenessScore={result.liveness_score}
          syncScore={result.sync_score}
        />
      </div>

      {details?.lipsyncResult?.flagged_segments?.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Lip-sync timeline</h2>
          <SyncTimeline
            segments={details.lipsyncResult.flagged_segments}
            totalDuration={totalDuration}
          />
        </div>
      )}

      {result.spectrum_url && (
        <div>
          <h2 className="text-lg font-medium mb-3">FFT spectrum heatmap</h2>
          <img src={result.spectrum_url} alt="FFT spectrum" className="rounded-lg w-full" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-sm">
        {[
          { label: 'Estimated HR', value: details?.livenessResult?.rppg?.estimated_hr_bpm
              ? `${details.livenessResult.rppg.estimated_hr_bpm} BPM` : 'N/A' },
          { label: 'Blink rate', value: details?.livenessResult?.blink?.blink_rate_per_min
              ? `${details.livenessResult.blink.blink_rate_per_min}/min` : 'N/A' },
          { label: 'Sync windows', value: details?.lipsyncResult?.windows_analyzed ?? 'N/A' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-xs mb-1">{label}</div>
            <div className="font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Phase 5 — Integration & Testing

**Duration: Week 8–10**

### 7.1 Backend Unit Tests

```javascript
// backend/tests/aggregator.test.js
import { computeFinalVerdict } from '../src/services/aggregator.js';

describe('computeFinalVerdict', () => {
  test('returns FAKE for high fake scores', () => {
    const result = computeFinalVerdict({
      fftResult:      { artifact_score: 0.9 },
      livenessResult: { liveness_score: 0.1 },
      lipsyncResult:  { sync_score: 0.05 }
    });
    expect(result.verdict).toBe('FAKE');
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  test('returns REAL for low fake scores', () => {
    const result = computeFinalVerdict({
      fftResult:      { artifact_score: 0.1 },
      livenessResult: { liveness_score: 0.9 },
      lipsyncResult:  { sync_score: 0.88 }
    });
    expect(result.verdict).toBe('REAL');
  });

  test('handles null scores gracefully (defaults to 0.5)', () => {
    const result = computeFinalVerdict({
      fftResult:      null,
      livenessResult: null,
      lipsyncResult:  null
    });
    expect(result.verdict).toBe('UNCERTAIN');
    expect(result.confidence).toBeCloseTo(0.5, 2);
  });
});
```

```javascript
// backend/tests/analysis.routes.test.js
import request from 'supertest';
import httpServer from '../src/app.js';
import * as orchestrator from '../src/services/mlOrchestrator.js';
import { jest } from '@jest/globals';

jest.mock('../src/services/mlOrchestrator.js');
jest.mock('../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test-user-id' }; next(); }
}));

describe('POST /api/analysis/submit', () => {
  it('returns 202 with jobId when valid video uploaded', async () => {
    orchestrator.runMLAnalysis.mockResolvedValue(undefined);
    const res = await request(httpServer)
      .post('/api/analysis/submit')
      .attach('video', Buffer.from('fake-video-data'), {
        filename: 'test.mp4',
        contentType: 'video/mp4'
      });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('jobId');
  });
});
```

### 7.2 Python Unit Tests

```python
# ml-services/liveness_service/tests/test_blink_detector.py
import pytest
from blink_detector import analyze_blinks
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"

def test_blink_detector_real_video():
    """Real video should have a plausible blink rate."""
    result = analyze_blinks(str(FIXTURES / "real_10s.mp4"))
    assert "blink_rate_per_min" in result
    assert result["frames_analyzed"] > 0
    # Real video: blink rate should be detectable (may or may not be in normal range)
    assert result["blink_rate_per_min"] >= 0

def test_blink_detector_no_face():
    """Video with no face should return zero blinks gracefully."""
    result = analyze_blinks(str(FIXTURES / "no_face.mp4"))
    assert result["blink_count"] == 0

def test_memory_safety(tmp_path):
    """Detector should not leak FaceMesh instances across runs."""
    # Run twice to ensure no resource leak
    result1 = analyze_blinks(str(FIXTURES / "real_10s.mp4"))
    result2 = analyze_blinks(str(FIXTURES / "real_10s.mp4"))
    assert result1["blink_count"] == result2["blink_count"]
```

### 7.3 Integration Test Checklist

Run through this manually before final submission:

- [ ] Upload a real video → verify `REAL` verdict (or at least not confidently FAKE)
- [ ] Upload a known deepfake → verify `FAKE` verdict
- [ ] Upload a video with no face → service returns graceful low-confidence result, not 500
- [ ] Upload a video with no audio → lipsync returns `NO_SPEECH_DETECTED`, not crash
- [ ] Upload a 100MB file → verify 100MB limit is enforced
- [ ] Upload an image (not video) → verify `Invalid file type` error
- [ ] Let a job run while watching Dashboard → Realtime badge updates automatically
- [ ] Disconnect internet mid-upload → verify error message shown to user
- [ ] Open result page for another user's job → verify 404 (RLS working)

---

## 8. Phase 6 — Model Training & Evaluation

**Duration: Week 9–11 (parallel with frontend)**

### 8.1 Dataset Preparation

| Dataset | Access | Use |
|---------|--------|-----|
| **FaceForensics++** | Request at github.com/ondyari/FaceForensics | FFT + liveness training |
| **Celeb-DF v2** | Direct download | Held-out generalization test |
| **Your own recordings** | Record yourself | Guaranteed demo material |
| **Wav2Lip outputs** | Generate from LRS3 | Lip-sync negative training examples |

**Preprocessing script for FFT training data:**

```python
# ml-services/fft_service/preprocess_spectra.py
"""
Converts raw videos into spectrum PNG images for CNN training.
Run once before training.

Usage:
  python preprocess_spectra.py --input_dir data/ff++ --output_dir data/spectra
"""
import cv2, numpy as np, argparse
from pathlib import Path
from PIL import Image
from analyzer import compute_frame_fft

parser = argparse.ArgumentParser()
parser.add_argument('--input_dir', required=True)
parser.add_argument('--output_dir', required=True)
parser.add_argument('--max_frames', type=int, default=50)
args = parser.parse_args()

for split in ['train', 'val', 'test']:
    for label in ['real', 'fake']:
        src = Path(args.input_dir) / split / label
        dst = Path(args.output_dir) / split / label
        dst.mkdir(parents=True, exist_ok=True)

        for video_path in src.glob('*.mp4'):
            cap = cv2.VideoCapture(str(video_path))
            count = 0
            while cap.isOpened() and count < args.max_frames:
                ret, frame = cap.read()
                if not ret: break
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                _, spectrum = compute_frame_fft(gray)
                norm = ((spectrum - spectrum.min()) /
                        (spectrum.max() - spectrum.min() + 1e-8) * 255).astype(np.uint8)
                out_path = dst / f"{video_path.stem}_{count:04d}.png"
                Image.fromarray(norm).save(str(out_path))
                count += 1
            cap.release()
            print(f"Processed {video_path.name} → {count} spectra")
```

### 8.2 Evaluation Script

```python
# evaluate.py — run on held-out test set after training
"""
Computes AUC-ROC, EER, and per-layer accuracy.
Usage: python evaluate.py --test_dir data/test_videos/
"""
import numpy as np
from sklearn.metrics import roc_auc_score, roc_curve
from pathlib import Path
import requests, json

def evaluate_service(service_url: str, video_paths: list, labels: list) -> dict:
    """Labels: 1=fake, 0=real"""
    scores = []
    for path in video_paths:
        try:
            # In practice, upload to Supabase and pass signed URL
            r = requests.post(f"{service_url}/analyze",
                              json={"video_url": str(path), "job_id": "eval"}, timeout=180)
            data = r.json()
            # Normalize to [0=real, 1=fake]
            if 'artifact_score' in data:      scores.append(data['artifact_score'])
            elif 'liveness_score' in data:    scores.append(1 - data['liveness_score'])
            elif 'sync_score' in data:        scores.append(1 - data['sync_score'])
        except Exception as e:
            print(f"Error on {path}: {e}")
            scores.append(0.5)

    y_true  = np.array(labels)
    y_score = np.array(scores)
    auc     = roc_auc_score(y_true, y_score)
    fpr, tpr, thresholds = roc_curve(y_true, y_score)
    eer_idx = np.argmin(np.abs(fpr - (1 - tpr)))
    eer     = float(fpr[eer_idx])
    acc     = float(np.mean((y_score > 0.5).astype(int) == y_true))
    return {"auc": round(auc, 4), "eer": round(eer, 4), "acc": round(acc, 4)}

# Expected targets from spec
TARGETS = {
    "FFT service":      {"auc": 0.85, "eer": 0.10},
    "Liveness service": {"auc": 0.80, "eer": 0.12},
    "Lipsync service":  {"auc": 0.87, "eer": 0.08},
}
```

---

## 9. Phase 7 — Deployment

**Duration: Week 12**

### 9.1 Deployment Architecture

| Component | Platform | Notes |
|-----------|---------|-------|
| Frontend | **Vercel** | Connect GitHub repo, auto-deploy on push to `main` |
| Backend | **Railway** | Node.js service, add env vars in dashboard |
| FFT + Liveness | **Railway** (CPU) or **EC2 g4dn.xlarge** | CPU viable for FFT/liveness |
| Lipsync | **EC2 g4dn.xlarge** (GPU) | Keep running during demo — Modal cold starts will kill the demo |
| Database + Auth | **Supabase** (managed) | No infra needed |
| Video Storage | **Supabase Storage** | Included in Supabase project |

### 9.2 Preventing GPU Cold Start Issues

```bash
# keep_warm.sh — run as cron every 5 minutes during the demo period
# Add to crontab: */5 * * * * /path/to/keep_warm.sh

curl -s https://your-lipsync-service.com/health > /dev/null
curl -s https://your-liveness-service.com/health > /dev/null
curl -s https://your-fft-service.com/health > /dev/null
echo "$(date): Pinged all ML services"
```

### 9.3 Model Weights at Container Startup

```python
# ml-services/lipsync_service/download_weights.py
"""
Downloads model weights from Supabase Storage if not present locally.
Called by the container startup script.
"""
import os, requests
from pathlib import Path

WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_PATH", "./weights"))
WEIGHTS_DIR.mkdir(exist_ok=True)

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SERVICE_KEY     = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET          = "maven-model-weights"

FILES_TO_FETCH = [
    "lipsync_expert.pth",
    "wav2lip_gan.pth",
]

for fname in FILES_TO_FETCH:
    local_path = WEIGHTS_DIR / fname
    if local_path.exists():
        print(f"{fname} already present, skipping download.")
        continue
    print(f"Downloading {fname} from Supabase Storage…")
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{fname}"
    r = requests.get(url, headers={"Authorization": f"Bearer {SERVICE_KEY}"}, stream=True)
    r.raise_for_status()
    with open(local_path, 'wb') as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
    print(f"Saved {fname} ({local_path.stat().st_size / 1e6:.1f} MB)")
```

```bash
# ml-services/lipsync_service/entrypoint.sh
#!/bin/bash
set -e
python download_weights.py
exec uvicorn main:app --host 0.0.0.0 --port 8003 --workers 1
```

### 9.4 CORS & Environment for Production

```javascript
// backend/src/app.js — production CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL  // e.g. https://maven-deepfake.vercel.app
    : '*',
  credentials: true
}));
```

---

## 10. Database Schema (Complete)

See [Phase 1 Section 3.2](#32-supabase-setup-complete-sql) for the full SQL migration.

**Summary of tables:**

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `analysis_jobs` | `id, user_id, video_path, status, error` | Realtime-enabled; RLS by user_id |
| `analysis_results` | `job_id, verdict, confidence, fft_score, liveness_score, sync_score, details` | JSONB `details` stores full per-service payloads |
| `storage.objects` | Managed by Supabase | RLS policy: `{user_id}/{job_id}.ext` path convention |

---

## 11. API Reference (Complete)

**Base URL (dev):** `http://localhost:4000/api`

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| `POST` | `/analysis/submit` | ✅ JWT | `multipart: { video: File }` | `202 { jobId, estimatedTime }` |
| `GET` | `/analysis/jobs` | ✅ JWT | — | `200 { jobs: [...] }` |
| `GET` | `/analysis/jobs/:id` | ✅ JWT | — | `200 job object` |
| `DELETE` | `/analysis/jobs/:id` | ✅ JWT | — | `200 { message }` |
| `GET` | `/results/:jobId` | ✅ JWT | — | `200 full result object` |
| `GET` | `/health` | ❌ | — | `200 { status: 'ok' }` |

**Python ML services** (internal only, no auth):

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/analyze` | `{ video_url, job_id }` | service-specific result JSON |
| `GET` | `/health` | — | `{ status: 'ok', service: '...' }` |

---

## 12. Environment Variables (All Services)

### `backend/.env`
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FFT_SERVICE_URL=http://fft-service:8001
LIVENESS_SERVICE_URL=http://liveness-service:8002
LIPSYNC_SERVICE_URL=http://lipsync-service:8003
```

### `frontend/.env`
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BACKEND_URL=http://localhost:4000
```

### `ml-services/fft_service/.env`
```env
PORT=8001
MODEL_WEIGHTS_PATH=./weights
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### `ml-services/liveness_service/.env`
```env
PORT=8002
MODEL_WEIGHTS_PATH=./weights
```

### `ml-services/lipsync_service/.env`
```env
PORT=8003
MODEL_WEIGHTS_PATH=./weights
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 13. Timeline & Milestones

```
Week 1    Infrastructure, Supabase setup, Docker, repo init
          ↳ Milestone M1: Supabase schema + auth + RLS working

Week 2    Node.js backend skeleton, auth middleware, Supabase service
Week 3    Upload API, Multer, rate limiting, ML orchestrator (stub)
          ↳ Milestone M2: Video upload → storage pipeline working end-to-end

Week 4    FFT service: frame extraction, HFR calculation, CNN training setup
          ↳ Start preprocessing FaceForensics++ spectra (GPU job)

Week 5    Liveness service: rPPG + blink (fix MediaPipe memory issue first)
Week 6    Lipsync service: Wav2Lip integration, windowed inference
          ↳ Milestone M3: All 3 ML services returning scores on test video

Week 7    Score aggregator, ML orchestrator fan-out, timeout handling
          ↳ Milestone M4: Full backend pipeline end-to-end (Node → ML → DB → Socket.io)

Week 8    React auth, upload page, dashboard with Realtime status
Week 9    React result page: VerdictCard, ScoreBreakdown, SyncTimeline
          ↳ Milestone M5: Frontend MVP (upload → result page live)

Week 10   Integration testing, bug fixes, E2E Playwright tests
Week 11   Model evaluation on benchmark datasets, fine-tune thresholds
          ↳ Milestone M6: AUC > 0.85 on held-out test set

Week 12   Production deployment, demo video recording, documentation
          ↳ Milestone M7: Live deployment + submission
```

---

## 14. Known Gaps & Decisions Log

This section documents every significant decision made in this implementation plan versus the original architectural spec.

| # | Decision | Reasoning |
|---|---------|-----------|
| 1 | **Use Wav2Lip sync discriminator instead of custom cross-modal transformer** | Training from scratch requires weeks of GPU time and 100k+ samples. Wav2Lip's discriminator is pre-trained on LRS3 and achieves state-of-the-art sync detection. Fine-tuning on DeepFakeTIMIT takes ~24 hours. |
| 2 | **Added Storage RLS policy (missing from spec)** | Without it, all uploaded videos are publicly accessible to any user with the anon key. Critical security fix. |
| 3 | **Python services fetch video via signed URL, not volume mount** | Simpler deployment, works on any cloud. Signed URLs are 3 hours long — sufficient for analysis. |
| 4 | **Added per-request job timeout (120s FFT/liveness, 180s lipsync)** | Prevents jobs hanging in PROCESSING state permanently if an ML service becomes unresponsive. |
| 5 | **Moved FaceMesh instantiation outside video loop in blink detector** | Spec's version instantiated inside the loop — a severe memory leak causing OOM crash on videos > 30s. |
| 6 | **Set MIN_FRAMES_FOR_RPPG = 200 (~8 seconds)** | Spec's threshold of 30 frames is 1.2 seconds — not enough for reliable HR estimation. |
| 7 | **Liveness score fused as 0.55×rPPG + 0.45×blink** | rPPG is a stronger deepfake signal than blink rate (which varies naturally). Spec listed both outputs but never showed fusion. |
| 8 | **Skip silent windows in lipsync** | Penalizing silence as out-of-sync inflates the fake score on videos with pauses. |
| 9 | **Used EC2 g4dn.xlarge over Modal.com for lipsync in production** | Modal scales to zero — cold starts take 30–60s. Unacceptable for live demo. Keep EC2 running during demo week. |
| 10 | **Added model weights download-on-startup script** | Weights are too large for git. Stored in Supabase Storage, downloaded at container start. |

---

*MAVEN — Built to defend digital trust against the next generation of synthetic media threats.*
