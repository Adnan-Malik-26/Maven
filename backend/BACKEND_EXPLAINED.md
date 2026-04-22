# MAVEN Backend — Complete Technical Explanation

> **Purpose:** This document explains how every part of the backend works in plain language. Built for interview prep — covers architecture decisions, design patterns, and answers to common interviewer questions.

---

## What Is MAVEN?

MAVEN is a **deepfake detection platform**. Users upload a video, and the backend sends it to 3 AI/ML microservices that analyze the video from different angles (frequency patterns, liveness, lip-sync). The backend collects all 3 scores, combines them into a single verdict (REAL / FAKE / UNCERTAIN), and pushes the result back to the user in real-time.

**Tech Stack:** Node.js, Express, Supabase (PostgreSQL + Auth + Storage), Socket.io, Python ML microservices.

---

## Architecture Overview

```
┌─────────────┐     REST + WebSocket      ┌──────────────────┐
│   Frontend   │ ◄──────────────────────► │   Express Server  │
│   (React)    │                           │   (Node.js)       │
└─────────────┘                           └────────┬─────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          │                         │                         │
                    ┌─────▼─────┐            ┌──────▼──────┐           ┌──────▼──────┐
                    │ FFT Service│            │  Liveness   │           │  LipSync    │
                    │ (Python)   │            │  (Python)   │           │  (Python)   │
                    │ Port 8001  │            │  Port 8002  │           │  Port 8003  │
                    └───────────┘            └─────────────┘           └─────────────┘
                          │                         │                         │
                          └─────────────────────────┼─────────────────────────┘
                                                    │
                                              ┌─────▼─────┐
                                              │  Supabase  │
                                              │ (Database  │
                                              │  Storage   │
                                              │  Auth)     │
                                              └───────────┘
```

---

## File Structure Explained

```
backend/
├── server.js                  ← Entry point — loads env, starts listening
├── src/
│   ├── app.js                 ← Creates Express app, Socket.io, mounts routes
│   ├── socket.js              ← Socket.io singleton (prevents circular deps)
│   ├── config/
│   │   └── index.js           ← Centralized config from environment variables
│   ├── utils/
│   │   └── logger.js          ← Winston logger setup
│   ├── middleware/
│   │   ├── auth.middleware.js  ← JWT verification (protects routes)
│   │   ├── upload.middleware.js← Multer config (file uploads)
│   │   └── error.middleware.js ← Global error handler (safety net)
│   ├── routes/
│   │   ├── auth.routes.js     ← Auth endpoints (signup, login, etc.)
│   │   ├── analysis.routes.js ← Video upload endpoint
│   │   └── results.routes.js  ← Results & history endpoints
│   ├── controllers/
│   │   ├── auth.controller.js ← Auth business logic
│   │   ├── analysis.controller.js ← Upload + job creation logic
│   │   └── results.controller.js  ← Fetch results + history logic
│   └── services/
│       ├── supabase.service.js← Supabase client initialization
│       ├── auth.service.js    ← Supabase Auth API calls
│       ├── analysis.service.js← Database CRUD (jobs, results, uploads)
│       ├── mlOrchestrator.js  ← Calls 3 ML services in parallel
│       └── aggregator.js      ← Combines ML scores into verdict
```

---

## Part-by-Part Explanation

### 1. `server.js` — The Entry Point

**What it does:** This is the first file that runs. It loads environment variables, then starts the HTTP server.

**How it works:**
1. `require('dotenv/config')` — reads `.env` file and puts values into `process.env`
2. Imports the `httpServer` from `app.js` (not the Express app directly — because Socket.io needs the raw HTTP server)
3. Calls `httpServer.listen(PORT)` to start accepting connections

**Why `server.js` and `app.js` are separate:**
> So you can import `app.js` in tests without actually starting a server. This is a standard Express pattern.

---

### 2. `src/app.js` — The Application Core

**What it does:** Creates the Express app, configures Socket.io, registers all middleware and routes in the correct order.

**How it works (in order):**
1. Creates Express app
2. Wraps it in a raw HTTP server (`createServer(app)`) — needed for Socket.io
3. Creates Socket.io server and registers it via `setIO(io)` (singleton pattern)
4. Sets up Socket.io connection handlers (join_job rooms)
5. Registers middleware: CORS → JSON parser → request logger
6. Mounts routes: `/api/auth`, `/api/analysis`, `/api/results`
7. Health check route: `GET /health`
8. 404 catch-all (must be AFTER all routes)
9. Global error handler (must be the VERY LAST middleware)

**Interview Q: Why does the order of middleware matter?**
> Express processes middleware top-to-bottom. If the error handler were above the routes, errors from routes would never reach it. If the 404 handler were above routes, every request would get 404.

**Interview Q: Why wrap Express in `createServer()`?**
> Socket.io can't attach to Express directly. It needs a raw Node.js HTTP server. By wrapping with `createServer(app)`, the same port serves both REST requests and WebSocket connections.

---

### 3. `src/socket.js` — The Singleton Pattern

**What it does:** Holds the Socket.io instance in a simple module so any file can access it without circular imports.

**The problem it solves:**
```
app.js → requires routes → requires controllers → requires mlOrchestrator.js
mlOrchestrator.js → requires app.js for `io`  ← CIRCULAR!
```

When `mlOrchestrator.js` tries to import `io` from `app.js`, `app.js` hasn't finished loading yet, so `io` is `undefined`.

**The solution:**
- `socket.js` holds a variable `io = null`
- `app.js` calls `setIO(io)` after creating it
- `mlOrchestrator.js` calls `getIO()` when it needs to emit — by this time, `io` is already set

**Interview Q: What is a circular dependency and how did you solve it?**
> When file A imports file B, and file B imports file A. Node.js gives you a partially-loaded module, causing `undefined` values. I solved it with the singleton pattern — extracting the shared resource into its own module that both files can safely import.

---

### 4. `src/config/index.js` — Centralized Configuration

**What it does:** Reads all environment variables once and exports a structured config object.

**Why centralize config?**
- If you scatter `process.env.SUPABASE_URL` across 20 files and typo one as `process.env.SUPABASE_ULR`, you get `undefined` silently — no error, just broken behavior
- With centralized config, you validate at startup. The `requireEnv()` helper **crashes the server immediately** if a required variable is missing
- This follows the **"fail fast, fail loud"** principle

**Interview Q: What is the fail-fast principle?**
> If something is wrong (like a missing config value), crash immediately at startup with a clear error message. Don't let the server start and fail later in a confusing way when a user hits a specific endpoint.

---

### 5. `src/utils/logger.js` — Winston Logger

**What it does:** Replaces `console.log` with a professional logger that adds timestamps, colors, and log levels.

**Why not just use console.log?**
- No timestamps → you can't tell when something happened
- No log levels → you can't filter errors vs info in production
- No formatting → hard to scan in production logs

**Log levels:** `error` > `warn` > `info` > `debug`. In production, we only show `warn` and `error`. In development, we show everything from `info` up.

---

### 6. `src/middleware/auth.middleware.js` — JWT Authentication

**What it does:** Protects routes by verifying that the incoming request has a valid Supabase JWT token.

**How it works step-by-step:**
1. Reads the `Authorization` header from the request
2. Checks it exists and starts with `"Bearer "` — if not, return `401`
3. Extracts the token (everything after "Bearer ")
4. Calls `supabase.auth.getUser(token)` — Supabase verifies the token is real, not expired, and not tampered with
5. If valid: attaches the user object to `req.user` and calls `next()` (pass to the next handler)
6. If invalid: returns `401 Unauthorized`

**Interview Q: What is a JWT?**
> JSON Web Token — a signed string containing the user's ID, email, and expiration. The signature prevents tampering. When Supabase Auth issues a JWT after login, only Supabase can verify it's genuine.

**Interview Q: What does `next()` do?**
> In Express, `next()` passes control to the next middleware or route handler. Without calling `next()`, the request gets stuck — no response is ever sent. If you call `next(err)` with an argument, Express skips to the error handler.

**Interview Q: What is the `req.user` pattern?**
> After verifying the token, we attach the user to `req.user`. Every subsequent controller can read `req.user.id` to know who's making the request. This avoids passing the user through function parameters.

---

### 7. `src/middleware/upload.middleware.js` — File Upload (Multer)

**What it does:** Configures Multer to accept video file uploads via `multipart/form-data`.

**Key decisions:**
- **Memory storage** (not disk): We immediately upload to Supabase Storage (cloud), so no need to write locally. Keeps the server stateless.
- **File filter**: Only accepts `video/mp4` and `video/webm`. Rejects everything else.
- **Size limit**: 5MB max. Prevents users from uploading huge files that eat server RAM.
- **`.single('video')`**: Expects exactly one file in a form field named `"video"`.

**Interview Q: Why use memory storage instead of disk?**
> Because the file goes straight to cloud storage (Supabase). Writing to disk first would be an unnecessary step. Memory storage also keeps the server stateless — meaning you can run multiple server instances without worrying about local file cleanup.

**Interview Q: Why can't Express handle file uploads natively?**
> Express's `express.json()` only parses JSON bodies. File uploads use `multipart/form-data` encoding, which is a completely different format. Multer is the middleware that parses this format and makes the file available at `req.file`.

---

### 8. `src/middleware/error.middleware.js` — Global Error Handler

**What it does:** A single safety net that catches ALL errors from anywhere in the app and returns consistent JSON responses.

**How Express knows it's an error handler:** It has **4 parameters** `(err, req, res, next)`. Express identifies error middleware solely by the parameter count. Even if you don't use `next`, you MUST include it.

**Error detection priority:**
1. **Multer errors** (file too big, wrong type) → `413` or `400`
2. **Custom errors** with `err.statusCode` (like Joi validation) → uses that code
3. **Everything else** → `500 Internal Server Error`

**Stack trace protection:** In production, the client gets a generic "Internal Server Error". In development, they get the actual error message. Stack traces are NEVER sent to the client — only logged server-side.

**Interview Q: Why is the error handler the last middleware?**
> Express processes middleware top-to-bottom. When any route calls `next(err)`, Express skips all normal middleware and jumps to the first error handler it finds. If the error handler were above routes, it would never catch their errors.

**Interview Q: How do you prevent information leakage?**
> Stack traces reveal file paths, library versions, and internal structure. In production, we return a generic message. The real error is logged server-side with Winston for debugging.

---

### 9. `src/services/supabase.service.js` — Database Connection

**What it does:** Creates two Supabase clients with different permission levels.

**Two clients, two keys:**
- **`supabase`** (anon key): Respects Row Level Security (RLS). Used for auth verification. Users can only see their own data.
- **`supabaseAdmin`** (service role key): Bypasses RLS. Used for backend operations like inserting jobs, uploading files. This key must NEVER be exposed to the frontend.

**Interview Q: What is Row Level Security (RLS)?**
> Database-level rules that restrict which rows a user can see. For example: "users can only SELECT rows where user_id = their own id." The anon key is bound by these rules. The service role key ignores them — it's for trusted server-side operations only.

**Interview Q: Why do you need two clients?**
> The anon client is used for auth verification (respects security policies). The admin client is used for backend data operations where we need full access — like creating jobs for any user or updating job statuses. Separation of privilege is a security best practice.

---

### 10. `src/services/analysis.service.js` — Database CRUD Layer

**What it does:** All database operations for the analysis pipeline.

**Functions:**

| Function | What It Does |
|---|---|
| `uploadVideoToStorage()` | Uploads video buffer to Supabase Storage bucket `maven-videos` |
| `createAnalysisJob()` | Creates a signed URL for the video, inserts a job row with status `PROCESSING` |
| `saveAnalysisResult()` | Inserts results into `analysis_results`, updates job to `COMPLETED` |
| `markJobFailed()` | Updates job to `FAILED` with an error message |
| `getJobWithResult()` | Fetches a job + its result (SQL JOIN) filtered by userId |
| `getUserJobHistory()` | Fetches last 50 jobs for a user, sorted newest first |

**Interview Q: Why use signed URLs instead of public URLs?**
> The storage bucket is private. A signed URL is a temporary link (expires in 1 hour) that includes a cryptographic signature. It lets the ML services download the video without needing authentication. After 1 hour, the link stops working — better security than permanent public URLs.

**Interview Q: What does `.select('*, analysis_results(*)')` do?**
> This is Supabase's syntax for a SQL JOIN. It means "give me all columns from `analysis_jobs` AND all columns from the related `analysis_results` table." It works because `analysis_results` has a foreign key (`job_id`) pointing to `analysis_jobs`.

---

### 11. `src/services/mlOrchestrator.js` — The Traffic Controller

**What it does:** Sends the video to all 3 Python ML services simultaneously, collects their results, and saves the combined verdict.

**How it works:**
1. Creates an `AbortController` with a 2-minute timeout
2. Sends 3 parallel `fetch()` POST requests via `Promise.all()`
3. Each request sends `{ video_path: signedUrl }` to the service's `/analyze` endpoint
4. Waits for all 3 to complete (runs in parallel, not sequentially)
5. Passes the 3 results to `computeFinalVerdict()` (the aggregator)
6. Saves the combined result to the database
7. Emits `analysis_complete` via Socket.io to notify the frontend
8. If anything fails: marks the job as `FAILED` and emits `analysis_failed`

**Interview Q: Why use `Promise.all()` instead of calling services one by one?**
> If FFT takes 5s, Liveness takes 8s, and LipSync takes 3s — sequential would take 16s total. With `Promise.all()`, all 3 run simultaneously, so total time is 8s (the slowest one). This is the **fan-out pattern** in microservice architectures.

**Interview Q: Why is `runMLAnalysis()` called WITHOUT `await` in the controller?**
> Because the HTTP response (`202 Accepted`) was already sent to the user. The analysis runs as a background task on the Node.js event loop. If we awaited it, the user would have to wait 2+ minutes for a response. Instead, they get an immediate `jobId` and receive results later via Socket.io.

**Interview Q: What happens if one ML service is down?**
> `Promise.all()` rejects if ANY promise fails. The catch block runs, which: (1) marks the job as `FAILED` in the database, (2) emits `analysis_failed` to the frontend. The job never gets stuck in `PROCESSING`.

**Interview Q: What is `AbortController`?**
> A built-in Node.js API for canceling fetch requests. We set a 2-minute timeout — if the ML service takes longer, the request is aborted and an error is thrown. This prevents our backend from hanging indefinitely if a service freezes.

---

### 12. `src/services/aggregator.js` — Score Fusion

**What it does:** Takes scores from 3 different ML models and combines them into a single verdict.

**The algorithm:**
1. **Normalize** all scores to a "fake probability" scale (0 = real, 1 = fake)
   - FFT's `artifact_score` is already on this scale
   - Liveness and LipSync return "authenticity" scores (1 = real), so we **invert** them: `1 - score`
2. **Weighted average**: FFT × 30% + Liveness × 40% + LipSync × 30%
3. **Threshold**: `< 0.40` = REAL, `0.40–0.65` = UNCERTAIN, `> 0.65` = FAKE

**Why weights?**
> Liveness detection gets the highest weight (40%) because it's the most reliable indicator of deepfakes. FFT and LipSync share the remaining 60% equally.

**Interview Q: Why not just average the scores equally?**
> Different models have different reliability levels. Liveness detection is more proven for deepfake detection, so it gets more influence. The weights are configurable — you could tune them based on validation data.

**Interview Q: What is score inversion and why do you need it?**
> FFT returns "fake probability" (higher = more fake). Liveness and LipSync return "authenticity" (higher = more real). To combine them, they must be on the same scale. Inverting (`1 - score`) converts authenticity to fake probability.

---

### 13. Socket.io — Real-Time Communication

**What it does:** Pushes analysis results to the frontend the instant they're ready. No polling needed.

**How room-based broadcasting works:**
1. Frontend submits a video → gets back `jobId`
2. Frontend emits `socket.emit('join_job', jobId)` → server adds the socket to room `job:<jobId>`
3. When analysis finishes, server emits to that specific room: `io.to('job:abc').emit('analysis_complete', data)`
4. Only the user who submitted that specific video receives the result

**Interview Q: Why Socket.io instead of polling?**
> Polling means the frontend asks "is it done yet?" every few seconds — wasteful and adds latency. With WebSocket, the server pushes data the instant it's ready. Socket.io also handles reconnection, fallbacks, and room management automatically.

**Interview Q: How do you prevent User A from seeing User B's results?**
> Room-based isolation. Each job has its own room (`job:<jobId>`). Only the client that submitted the video joins that room. When the result is emitted, it goes only to that room. There's no way for another user to join someone else's room without knowing the UUID.

---

### 14. The Controller Layer — Request Handling

**Pattern used: Route → Middleware → Controller → Service**

```
Request → auth.middleware (verify JWT)
        → upload.middleware (parse file, if needed)
        → controller (validate input, call services, send response)
        → service (database/external API calls)
```

**Interview Q: Why separate controllers and services?**
> **Controllers** handle HTTP concerns (reading `req.params`, sending `res.json`). **Services** handle business logic (database queries, API calls). This separation means you can reuse services from different controllers, test business logic independently, and swap databases without changing controllers.

---

### 15. Joi Validation

**What it does:** Validates that `jobId` is a valid UUID format before querying the database.

**Why validate early?**
> Without validation, `GET /api/results/not-a-uuid` goes all the way to Supabase, which returns a cryptic PostgreSQL error. With Joi, we catch it instantly and return a clean `400 Bad Request`. This saves a database round-trip and gives the user a clear error message.

---

## Common Interview Questions & Answers

### Architecture & Design

**Q: Describe the architecture of your backend.**
> It's a monolithic Express.js server that acts as an API gateway and orchestrator. It handles authentication, file uploads, and coordinates with 3 Python ML microservices. The backend follows a layered architecture: routes → middleware → controllers → services. Real-time updates use Socket.io. Data is stored in Supabase (PostgreSQL) with file storage in Supabase Storage.

**Q: Why did you choose a microservice architecture for the ML models?**
> ML models often have different dependencies (PyTorch, TensorFlow, OpenCV) that conflict with each other. Separate services let each model run in its own environment. It also allows independent scaling — if liveness detection is slow, you can add more instances without touching the other services.

**Q: What design patterns did you use?**
> - **Middleware pattern** (Express): Auth, upload, error handling as composable layers
> - **Singleton pattern**: Socket.io instance shared via `socket.js`
> - **Fan-out pattern**: Parallel calls to 3 ML services via `Promise.all()`
> - **Job/Queue pattern**: Async processing with status tracking (PROCESSING → COMPLETED/FAILED)
> - **Service layer pattern**: Separation of HTTP handling from business logic

### Security

**Q: How do you handle authentication?**
> Supabase Auth handles user management. The frontend gets a JWT after login and sends it in the Authorization header. My middleware verifies the token with Supabase on every request and attaches the user to `req.user`. All data queries filter by `user_id` to ensure users only see their own data.

**Q: How do you prevent unauthorized data access?**
> Three layers: (1) JWT middleware rejects unauthenticated requests, (2) every database query filters by `userId` from the verified token, (3) Supabase RLS as a database-level safety net — even if my code has a bug, the database itself enforces row-level access control.

**Q: How do you handle sensitive data?**
> Environment variables for all secrets (never hardcoded). `.env` is gitignored. Service role key is only used server-side and never sent to the client. Stack traces are never leaked in error responses. Signed URLs expire after 1 hour.

### Error Handling

**Q: How do you handle errors?**
> I use a global error handler middleware that catches every error. Controllers call `next(err)` instead of handling errors individually. The error handler detects the error type (Multer, validation, custom, unknown) and returns the appropriate HTTP status code. All errors follow a consistent `{ error: "message" }` format.

**Q: What happens if one of your ML services goes down?**
> The job is marked as `FAILED` in the database with the error message. The frontend receives an `analysis_failed` Socket.io event. The user sees a clear failure message. The job never gets stuck in `PROCESSING`.

### Performance

**Q: How do you handle long-running tasks?**
> The async job pattern. When a user submits a video, the server responds immediately with `202 Accepted` and a `jobId`. The ML analysis runs in the background (un-awaited promise). The user tracks progress via Socket.io or by polling `GET /api/results/:jobId`.

**Q: Why use `Promise.all()` and what's the tradeoff?**
> It runs all 3 ML calls in parallel, reducing total time from `sum(all)` to `max(all)`. The tradeoff: if ANY one fails, the entire `Promise.all` rejects. I handle this by catching the error and marking the job as failed. An alternative would be `Promise.allSettled()` which lets you get partial results even if one service fails.

---

## Data Flow: Complete Request Lifecycle

```
User clicks "Analyze Video"
         │
         ▼
[1] POST /api/analysis/submit (with video file)
         │
         ▼
[2] auth.middleware → verifies JWT → attaches req.user
         │
         ▼
[3] upload.middleware → parses multipart form → attaches req.file
         │
         ▼
[4] analysis.controller → uploads file to Supabase Storage
                        → creates signed URL
                        → inserts job row (status: PROCESSING)
                        → responds 202 { jobId: "abc" }
                        → kicks off runMLAnalysis() (background)
         │
         ▼
[5] mlOrchestrator → sends video URL to 3 ML services in parallel
                   → waits for all 3 responses
                   → passes scores to aggregator
         │
         ▼
[6] aggregator → normalizes scores → weighted average → verdict
         │
         ▼
[7] analysis.service → saves result to database
                     → updates job status to COMPLETED
         │
         ▼
[8] Socket.io → emits "analysis_complete" to the user's room
         │
         ▼
[9] Frontend receives the verdict in real-time 🎉
```

---

> **Remember:** In an interview, don't just explain WHAT you built — explain WHY you made each decision. Every architectural choice in this backend has a reason behind it. That's what separates a good answer from a great one.
