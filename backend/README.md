# MAVEN Backend — Feature-by-Feature Implementation Plan

> Build the backend **one feature at a time**. Complete each feature fully, test it, and only then move to the next. Each feature builds on the previous one.

---

## How to Read This Plan

Each feature follows this format:

- **🎯 Goal** — What you're building and why, in plain English
- **📁 Files to Create/Edit** — Exactly which files you'll work on
- **📦 Libraries Needed** — What to install for this feature specifically
- **🧠 Key Concepts** — Things you should understand before coding
- **🔨 What to Build** — Step-by-step instructions (no code, just direction)
- **✅ How to Verify** — How you know this feature is working
- **➡️ Unlock** — What this feature enables you to build next

---

## Feature Map (The Big Picture)

```
Feature 1: Project Setup           ← You start here
    │
Feature 2: Config & Logging        ← Foundation layer
    │
Feature 3: Supabase Connection     ← Database layer
    │
    ├── Feature 4: Authentication  ← Security layer
    │
    ├── Feature 5: Video Upload    ← File handling
    │
    └── Feature 6: Job Management  ← Database CRUD
            │
        Feature 7: ML Orchestrator ← External service calls
            │
        Feature 8: Score Fusion    ← Business logic
            │
        Feature 9: Real-time Push  ← WebSocket layer
            │
        Feature 10: Results API    ← Read endpoints
            │
        Feature 11: Error Handling ← Polish & hardening
```

---

---

## Feature 1: Project Setup & Basic Server

### 🎯 Goal

Get a bare-bones Express server running on `http://localhost:4000` that responds to a health check. This is your "Hello World" — if this works, your project foundation is solid.

### 📁 Files to Create

```
backend/
├── package.json        ← npm init, define scripts and "type": "module"
├── .gitignore          ← ignore node_modules, .env
├── .env                ← empty for now (just PORT=4000)
├── .env.example        ← same as .env but committed to git
├── server.js           ← entry point, starts listening on PORT
└── src/
    └── app.js          ← creates Express app, adds CORS, defines /health route
```

### 📦 Libraries Needed

```bash
npm init -y
npm install express cors dotenv
```

| Library | Why you need it |
|---------|----------------|
| `express` | Web framework — creates the HTTP server, handles routing |
| `cors` | Allows your React frontend (running on a different port) to call this API |
| `dotenv` | Reads your `.env` file and loads the values into `process.env` |

### 🧠 Key Concepts

- **ES Modules**: Add `"type": "module"` to your `package.json`. This lets you use `import/export` instead of `require()`. Modern Node.js standard.
- **Separating `server.js` and `app.js`**: `app.js` creates the Express app (routes, middleware). `server.js` just imports it and calls `.listen()`. Why? So you can import `app.js` in tests without actually starting a server.
- **Middleware order**: In Express, middleware runs top-to-bottom. `cors()` and `express.json()` must be registered **before** your routes.

### 🔨 What to Build

1. Run `npm init -y` in the `backend/` folder
2. Open `package.json`, add `"type": "module"` and a `"dev"` script that runs `node --watch server.js` (auto-restarts on file changes)
3. Create `.env` with just `PORT=4000`
4. Create `src/app.js`:
   - Import `express` and `cors`
   - Create an Express app
   - Add `cors()` middleware
   - Add `express.json()` middleware
   - Add one route: `GET /health` → responds with `{ status: "ok" }`
   - Export the app
5. Create `server.js`:
   - Import dotenv (load `.env` at the very top)
   - Import the app from `src/app.js`
   - Read `PORT` from `process.env`
   - Call `app.listen(PORT)` and log a startup message

### ✅ How to Verify

```bash
npm run dev
# In another terminal:
curl http://localhost:4000/health
# Expected: { "status": "ok" }
```

### ➡️ Unlock

You now have a running server. Next: add proper configuration and logging so you stop using `console.log`.

---

---

## Feature 2: Configuration & Logging

### 🎯 Goal

Create a centralized config system (so you never scatter `process.env.SOMETHING` across 20 files) and a proper logger (so you get timestamps, colors, and log levels instead of raw `console.log`).

### 📁 Files to Create

```
src/
├── config/
│   └── index.js       ← reads .env, exports a structured config object
└── utils/
    └── logger.js      ← configures Winston logger
```

### 📦 Libraries Needed

```bash
npm install winston
```

| Library | Why you need it |
|---------|----------------|
| `winston` | Professional logging library. Adds timestamps, log levels (`info`, `warn`, `error`), colored output, and can write to files |

### 🧠 Key Concepts

- **Centralized config**: Instead of `process.env.PORT` everywhere, you do `config.port`. If you typo `process.env.PROT` you get `undefined` silently. With centralized config, you validate once and catch issues at startup.
- **Log levels**: Winston has levels: `error` > `warn` > `info` > `debug`. In production, you only want `error` and `warn`. In development, you want all of them. Set this based on `NODE_ENV`.
- **`requireEnv()` helper**: Write a small function that throws an error if a required env var is missing. This prevents your app from starting with missing keys — fail fast, fail loud.

### 🔨 What to Build

1. Create `src/config/index.js`:
   - Write a helper function `requireEnv(key)` that reads `process.env[key]` and throws if it's missing
   - Export a `config` object with nested sections: `{ port, nodeEnv, supabase: { url, keys }, mlServices: { urls }, upload: { maxSize, allowedTypes } }`
   - For now, only `port` and `nodeEnv` will have values. The rest will be added as you build later features. You can use `process.env.X || 'default'` for optional values
2. Create `src/utils/logger.js`:
   - Import Winston
   - Configure a format with timestamp + colors + a custom `printf` template like `[2026-04-08 12:00:00] info: message here`
   - Set the log level based on `NODE_ENV` (production → `warn`, else → `info`)
   - Export the logger
3. Update `server.js`:
   - Replace `console.log` with `logger.info()`
   - Import config and use `config.port` instead of `process.env.PORT`
4. Update `src/app.js`:
   - Add a request logging middleware: for every incoming request, log `"GET /health"` (method + path)

### ✅ How to Verify

```bash
npm run dev
# You should see colored, timestamped output like:
# [2026-04-08 12:00:00] info: 🚀 MAVEN Backend running on port 4000

curl http://localhost:4000/health
# Server logs should show:
# [2026-04-08 12:00:01] info: GET /health
```

Try removing a required env var from `.env` → the server should crash at startup with a clear error message.

### ➡️ Unlock

Your foundation is solid. Next: connect to Supabase so you have a database to work with.

---

---

## Feature 3: Supabase Connection

### 🎯 Goal

Connect your backend to Supabase (your database + file storage). You'll create two Supabase clients and write helper functions for common database operations.

### 📁 Files to Create

```
src/
└── services/
    └── supabase.service.js   ← Supabase clients + DB/Storage helper functions
```

### 📦 Libraries Needed

```bash
npm install @supabase/supabase-js
```

| Library | Why you need it |
|---------|----------------|
| `@supabase/supabase-js` | Official SDK to talk to your Supabase project — database queries, file uploads, auth verification |

### 🧠 Key Concepts

- **Two clients, two keys**: Supabase gives you two keys:
  - `ANON_KEY` — Respects Row Level Security (RLS). The frontend uses this key. Users can only access their own data.
  - `SERVICE_ROLE_KEY` — **Bypasses** RLS. Only the backend uses this. It can read/write any user's data. **Never expose this key to the frontend.**
- **Row Level Security (RLS)**: Supabase lets you set rules like "users can only SELECT rows where `user_id = their id`". The `anon` key is bound by these rules. The `service_role` key ignores them.
- **Supabase Storage**: Works like a cloud file system. You create a "bucket" (like a folder), upload files to it, and get back a path. Think of it like a simpler S3.

### 🔨 What to Build

**Before coding — Supabase setup (do this in the Supabase dashboard):**
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to **Storage** → Create a private bucket called `maven-videos`
3. Go to **Settings → API** → Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
4. Add these to your `.env` file
5. Go to **SQL Editor** and create the tables you need:
   - `analysis_jobs` table: `id` (uuid, PK), `user_id` (uuid), `video_path` (text), `status` (text), `error_message` (text, nullable), `created_at` (timestamptz), `completed_at` (timestamptz, nullable)
   - `analysis_results` table: `id` (uuid, PK), `job_id` (uuid, FK → analysis_jobs), `verdict` (text), `confidence` (float), `fft_score` (float), `liveness_score` (float), `sync_score` (float), `details` (jsonb)
6. Enable RLS on both tables and add policies: "Users can only see their own rows"

**Then build `supabase.service.js`:**
1. Import `createClient` from `@supabase/supabase-js`
2. Create two clients:
   - `supabasePublic` using the `ANON_KEY`
   - `supabaseAdmin` using the `SERVICE_ROLE_KEY`
3. Write and export these helper functions (just the function signatures for now — you'll fill in the logic):
   - `uploadVideoToStorage(fileBuffer, originalName, userId)` → uploads a file to the `maven-videos` bucket, returns the file path
   - `createAnalysisJob(userId, videoPath)` → inserts a row into `analysis_jobs` with status `PROCESSING`, returns the new row
   - `saveAnalysisResult(jobId, verdict, rawResults)` → inserts into `analysis_results` and updates the job status to `COMPLETED`
   - `markJobFailed(jobId, errorMessage)` → updates the job status to `FAILED`
   - `getJobWithResult(jobId, userId)` → fetches a job + its result (joined), filtered by userId
   - `getUserJobHistory(userId)` → fetches the last 50 jobs for a user

### ✅ How to Verify

Write a small temporary test at the bottom of `supabase.service.js` (remove it after testing):

```
- Create a test job → check it appears in the Supabase dashboard
- Fetch it back → confirm the data matches
- Delete the test row from the dashboard
```

Or use the Supabase dashboard **Table Editor** to manually verify your inserts are showing up.

### ➡️ Unlock

You now have a working database layer. Next: add authentication so only logged-in users can access your API.

---

---

## Feature 4: Authentication Middleware

### 🎯 Goal

Protect your API endpoints so only logged-in users with a valid Supabase JWT token can access them. Any request without a token (or with an expired/fake token) gets rejected with a `401 Unauthorized` response.

### 📁 Files to Create

```
src/
└── middleware/
    └── auth.middleware.js   ← validates JWT, attaches user to request
```

### 📦 Libraries Needed

None — you already have `@supabase/supabase-js` which handles token verification.

### 🧠 Key Concepts

- **JWT (JSON Web Token)**: When a user logs in via Supabase Auth on the frontend, Supabase gives them a JWT. This is a long encoded string that contains the user's ID, email, and expiration time. The backend needs to verify this string is genuine.
- **`Authorization` header**: The industry standard way to send tokens. The frontend sends: `Authorization: Bearer eyJhbGciOi...`. Your middleware reads this header, extracts the token part after "Bearer ", and verifies it.
- **`req.user` pattern**: After verifying the token, you attach the user object to `req.user`. All downstream controllers can then do `req.user.id` to know who's making the request. This is a very common Express pattern.
- **Middleware in Express**: A middleware is a function with `(req, res, next)`. Call `next()` to pass control to the next handler. Call `res.status(401).json(...)` to stop the chain and send a response immediately.

### 🔨 What to Build

1. Create `src/middleware/auth.middleware.js`
2. Export a function called `requireAuth` that takes `(req, res, next)`
3. Inside it:
   - Read the `Authorization` header from `req.headers.authorization`
   - If missing or doesn't start with `"Bearer "` → return `401`
   - Extract the token string (everything after `"Bearer "`)
   - Call `supabaseAdmin.auth.getUser(token)` — this asks Supabase to verify the token
   - If Supabase returns an error or no user → return `401`
   - If valid → set `req.user = user` and call `next()`
   - Wrap everything in try/catch — if anything unexpected happens, call `next(err)`
4. Update `src/routes/auth.routes.js`:
   - Create a route: `GET /api/auth/verify`
   - Apply `requireAuth` as middleware
   - If the request makes it past the middleware, respond with `{ authenticated: true, user: { id, email } }`
5. Register the auth routes in `src/app.js`

### ✅ How to Verify

You need a real Supabase JWT token to test this. Two ways to get one:

**Option A** — Use the Supabase dashboard:
- Go to **Authentication → Users** → Create a user manually
- Use the Supabase JavaScript client in a browser console or a test script to log in and get a token

**Option B** — Use curl with a fake/missing token to test the rejection path:
```bash
# No token → should get 401
curl http://localhost:4000/api/auth/verify

# Wrong token → should get 401
curl -H "Authorization: Bearer fake-token" http://localhost:4000/api/auth/verify

# Valid token → should get 200 with user info
curl -H "Authorization: Bearer <real-token>" http://localhost:4000/api/auth/verify
```

### ➡️ Unlock

Your API is now secured. Next: let users upload video files.

---

---

## Feature 5: Video Upload

### 🎯 Goal

Accept video files from the frontend (sent as `multipart/form-data`), validate the file type and size, and upload it to Supabase Storage. After this feature, you can receive and store videos — the first real user-facing capability.

### 📁 Files to Create/Edit

```
src/
├── middleware/
│   └── upload.middleware.js       ← NEW: Multer config for video files
├── controllers/
│   └── analysis.controller.js     ← NEW: handles the upload endpoint logic
└── routes/
    └── analysis.routes.js         ← NEW: maps POST /api/analysis/submit
```

Also **edit**: `src/app.js` (register the new route)

### 📦 Libraries Needed

```bash
npm install multer
```

| Library | Why you need it |
|---------|----------------|
| `multer` | Express middleware that parses `multipart/form-data` requests (file uploads). Without Multer, Express cannot read uploaded files — `req.body` would be empty. |

### 🧠 Key Concepts

- **multipart/form-data**: When a browser sends a file, it doesn't use JSON. It uses a special encoding called `multipart/form-data`. Express's built-in `express.json()` can't parse this. You need Multer.
- **Memory storage vs disk storage**: Multer can save uploaded files to disk or keep them in RAM (memory). We use **memory storage** because:
  - We immediately upload to Supabase Storage (cloud), so no need to write locally
  - Keeps the server **stateless** — no local files means easy scaling and no cleanup
  - Tradeoff: large files use RAM. That's why we set a max file size.
- **`req.file`**: After Multer processes the request, the file is available at `req.file` with properties: `.buffer` (the raw bytes), `.originalname`, `.mimetype`, `.size`
- **`.single('video')`**: Tells Multer to expect exactly one file in a form field named `"video"`. The frontend must use this exact field name.
- **Middleware chain**: The route will chain three middleware: `requireAuth → uploadVideo → submitVideo`. Each one runs in sequence. Auth first (reject unauthenticated), then file parsing, then business logic.

### 🔨 What to Build

1. **Create `upload.middleware.js`**:
   - Import `multer` and your config
   - Configure `multer.memoryStorage()`
   - Write a `fileFilter` function that checks `file.mimetype` against your allowed types from config (e.g., `video/mp4`, `video/webm`). Reject others with an error.
   - Set `limits.fileSize` to your max from config (convert MB to bytes: `MB * 1024 * 1024`)
   - Export the configured multer middleware as `uploadVideo` using `.single('video')`

2. **Create `analysis.controller.js`**:
   - Export a function `submitVideo(req, res, next)`
   - Check that `req.file` exists (if not → 400 error)
   - Get `userId` from `req.user.id` (set by auth middleware)
   - Call `uploadVideoToStorage()` from your Supabase service to upload `req.file.buffer` to cloud storage
   - For now, just respond with `{ message: "Video uploaded", videoPath: "..." }` — you'll add job creation in the next feature

3. **Create `analysis.routes.js`**:
   - Create a route: `POST /api/analysis/submit`
   - Chain the middleware: `requireAuth`, `uploadVideo`, `submitVideo`
   - Export the router

4. **Register in `app.js`**: Import and mount the analysis routes at `/api/analysis`

### ✅ How to Verify

Use Postman, Insomnia, or curl to upload a video:

```bash
curl -X POST http://localhost:4000/api/analysis/submit \
  -H "Authorization: Bearer <your-token>" \
  -F "video=@/path/to/test-video.mp4"
```

Then check:
- ✅ Response is `200` with the video path
- ✅ The file appears in your Supabase dashboard → Storage → `maven-videos` bucket
- ✅ Uploading a `.pdf` gets rejected
- ✅ Uploading without auth gets `401`

### ➡️ Unlock

You can receive and store videos. Next: create job records in the database to track each analysis.

---

---

## Feature 6: Job Management (Database CRUD)

### 🎯 Goal

When a user uploads a video, create a "job" record in the database to track its progress (`PROCESSING` → `COMPLETED` or `FAILED`). Change the upload endpoint to return a `jobId` so the frontend can track the analysis.

### 📁 Files to Edit

```
src/
├── controllers/
│   └── analysis.controller.js     ← EDIT: add job creation after upload
└── services/
    └── supabase.service.js        ← EDIT: ensure createAnalysisJob() is working
```

### 📦 Libraries Needed

None new — you already have `@supabase/supabase-js`.

### 🧠 Key Concepts

- **Job pattern**: Long-running tasks (like ML analysis) use the "job" pattern. Instead of making the user wait 2 minutes for a response, you immediately return a `jobId` and process the work in the background. The user can poll or listen for updates using the `jobId`.
- **HTTP 202 Accepted**: The perfect status code for "I received your request and will process it later." Unlike `200 OK` (done) or `201 Created` (resource created), `202` means "acknowledged, not yet complete."
- **Non-blocking async**: You'll call `runMLAnalysis()` **without** `await`. This means the function starts running but the controller doesn't wait for it to finish — it sends the response immediately. The ML analysis runs in the background. You attach `.catch()` to handle errors silently.

### 🔨 What to Build

1. **Verify your Supabase helper functions work**:
   - Test `createAnalysisJob(userId, videoPath)` — does it insert a row and return it?
   - Test `markJobFailed(jobId, errorMessage)` — does it update the status?
   - Check the Supabase dashboard after each test to confirm

2. **Update `analysis.controller.js`**:
   - After uploading the video to storage, call `createAnalysisJob(userId, videoPath)`
   - Change the response to `202 Accepted` with `{ message: "Analysis started", jobId: job.id }`
   - Add a placeholder comment where the ML analysis call will go: `// TODO: Feature 7 — call runMLAnalysis(videoPath, job.id)`

### ✅ How to Verify

```bash
curl -X POST http://localhost:4000/api/analysis/submit \
  -H "Authorization: Bearer <your-token>" \
  -F "video=@/path/to/test-video.mp4"

# Expected response:
# { "message": "Analysis started", "jobId": "550e8400-..." }
```

Check the Supabase dashboard:
- ✅ A new row in `analysis_jobs` with status `PROCESSING`
- ✅ The `video_path` matches the file in Storage
- ✅ The `user_id` matches the authenticated user

### ➡️ Unlock

You have upload + job tracking. Next: call the Python ML services to actually analyze the video.

---

---

## Feature 7: ML Orchestrator (Calling Python Services)

### 🎯 Goal

Build the "traffic controller" that sends the uploaded video to all 3 Python ML services (FFT, Liveness, LipSync) **in parallel**, collects their results, and saves the combined result to the database.

### 📁 Files to Create/Edit

```
src/
├── services/
│   ├── mlOrchestrator.js    ← NEW: fan-out to Python services
│   └── aggregator.js        ← NEW: combine scores (build this first!)
└── controllers/
    └── analysis.controller.js  ← EDIT: call runMLAnalysis() after job creation
```

### 📦 Libraries Needed

```bash
npm install axios
```

| Library | Why you need it |
|---------|----------------|
| `axios` | HTTP client library. You use it to make POST requests to the Python ML services from your Node.js backend. Cleaner than the built-in `fetch` for error handling, timeouts, and response parsing. |

### 🧠 Key Concepts

- **`Promise.all()`**: Takes an array of promises and runs them **simultaneously**. Returns when **all** have finished. If FFT takes 5s, Liveness takes 8s, and LipSync takes 3s, the total is 8s (not 16s). If **any one fails**, the whole `Promise.all` rejects — wrap it in try/catch.
- **Fan-out pattern**: Sending one request to multiple services in parallel. Common in microservice architectures. The orchestrator is the central coordinator.
- **Axios timeout**: Always set a timeout when calling external services. If a Python service hangs forever, your backend would hang too. Set a 2-minute timeout (`timeout: 120000` ms).
- **Background execution**: In the controller, you call `runMLAnalysis(videoPath, jobId)` **without `await`**. Attach `.catch()` to prevent unhandled rejection. The response (`202`) was already sent — this runs independently.

### 🔨 What to Build

1. **Build `aggregator.js` first** (it has no dependencies):
   - Export a function `computeFinalVerdict({ fftResult, livenessResult, lipsyncResult })`
   - Define weights: FFT=30%, Liveness=40%, LipSync=30%
   - Convert scores to a unified "fake probability" scale (0=real, 1=fake):
     - FFT's `artifact_score` is already on this scale
     - Liveness and LipSync return "authenticity" scores, so **invert** them: `1 - score`
   - Compute weighted average
   - Apply thresholds: `< 0.40` = REAL, `0.40–0.65` = UNCERTAIN, `> 0.65` = FAKE
   - Return `{ verdict, confidence, breakdown }`

2. **Build `mlOrchestrator.js`**:
   - Export an async function `runMLAnalysis(videoPath, jobId)`
   - Read the 3 ML service URLs from your config
   - Use `Promise.all()` with 3 `axios.post()` calls, each sending `{ video_path: videoPath }` to the `/analyze` endpoint
   - Set a timeout on each request (2 minutes)
   - Pass the 3 results to `computeFinalVerdict()`
   - Call `saveAnalysisResult()` from your Supabase service
   - **In the catch block**: call `markJobFailed()` so the job doesn't stay stuck in PROCESSING forever

3. **Update `analysis.controller.js`**:
   - After the `res.status(202).json(...)` response, add: `runMLAnalysis(videoPath, job.id).catch(...)`
   - Do NOT `await` it — the response was already sent

### ✅ How to Verify

**Without the Python services running** — test the failure path:
```bash
# Upload a video → should get 202 immediately
# Then check Supabase dashboard → job status should become FAILED
# (because the ML services aren't running, axios will get connection refused)
```

**With mock Python services** — create a tiny Express server on ports 8001/8002/8003 that returns fake scores:
```
POST /analyze → { "artifact_score": 0.87, "liveness_score": 0.91, "sync_score": 0.12 }
```
Upload a video → check that `analysis_results` has a row with the computed verdict.

### ➡️ Unlock

The core pipeline works end-to-end. Next: push results to the frontend in real-time so they don't have to keep refreshing.

---

---

## Feature 8: Real-Time Updates (Socket.io)

### 🎯 Goal

Push analysis results to the frontend the instant they're ready, using WebSockets. No polling, no refreshing — the frontend gets a live notification.

### 📁 Files to Edit

```
src/
├── app.js                    ← EDIT: create Socket.io server, export `io`
└── services/
    └── mlOrchestrator.js     ← EDIT: emit events when analysis finishes
```

Also **edit**: `server.js` (use `httpServer` instead of `app`)

### 📦 Libraries Needed

```bash
npm install socket.io
```

| Library | Why you need it |
|---------|----------------|
| `socket.io` | WebSocket library. Unlike HTTP (request → response), WebSockets keep a persistent two-way connection. The server can push data to the client at any time without the client asking. |

### 🧠 Key Concepts

- **HTTP vs WebSocket**: HTTP is like texting — you send a message, you wait for a reply. WebSocket is like a phone call — once connected, both sides can talk anytime. For real-time updates, WebSocket is far better than polling.
- **Socket.io rooms**: A "room" is a channel that specific clients join. When the frontend submits a video and gets back `jobId: "abc123"`, it joins the room `"job:abc123"`. When the backend finishes analysis, it emits an event to that room. Only that specific user receives it.
- **`httpServer` wrapping**: Socket.io cannot attach directly to an Express `app`. You need to:
  1. Create a raw HTTP server: `const httpServer = createServer(app)`
  2. Attach Socket.io to the HTTP server: `new Server(httpServer)`
  3. Call `httpServer.listen()` instead of `app.listen()`
- **Events**: You define custom event names like `analysis_complete` and `analysis_failed`. The frontend listens for these specific events.

### 🔨 What to Build

1. **Update `src/app.js`**:
   - Import `createServer` from `http`
   - Wrap your Express app: `const httpServer = createServer(app)`
   - Create a Socket.io server: `const io = new Server(httpServer, { cors: { origin: '*' } })`
   - Add a connection listener: when a client connects, listen for a `'join_job'` event where the client sends a `jobId`, and add that socket to the room `"job:<jobId>"`
   - **Export** both `httpServer` (default) and `io` (named export)

2. **Update `server.js`**:
   - Import `httpServer` (not `app`)
   - Call `httpServer.listen(PORT)` instead of `app.listen(PORT)`

3. **Update `mlOrchestrator.js`**:
   - Import `io` from `app.js`
   - **On success**: After saving the result, emit to the room:
     `io.to("job:<jobId>").emit("analysis_complete", { jobId, verdict, confidence, breakdown })`
   - **On failure**: After marking the job failed, emit:
     `io.to("job:<jobId>").emit("analysis_failed", { jobId, error: "..." })`

### ✅ How to Verify

You can test Socket.io without a frontend using a quick test from the browser console or a small script:

1. Install the Socket.io client for testing: `npm install -D socket.io-client`
2. Write a tiny test script that:
   - Connects to `http://localhost:4000`
   - Emits `join_job` with a known job ID
   - Listens for `analysis_complete` and `analysis_failed`
3. Upload a video → the test script should receive the event when analysis finishes

Or use a browser extension like "Socket.IO Tester" to connect and listen for events.

### ➡️ Unlock

Your pipeline is now fully real-time. Next: build the REST endpoints for fetching results and history.

---

---

## Feature 9: Results API

### 🎯 Goal

Build endpoints that let the frontend fetch analysis results (for a specific job) and the user's analysis history (all past jobs). These are simple read-only endpoints.

### 📁 Files to Create

```
src/
├── controllers/
│   └── results.controller.js   ← NEW: handlers for fetching results
└── routes/
    └── results.routes.js       ← NEW: maps GET endpoints
```

Also **edit**: `src/app.js` (register the results routes)

### 📦 Libraries Needed

None new.

### 🧠 Key Concepts

- **Route parameter ordering**: When you have both `GET /results/history` and `GET /results/:jobId`, the order in your code matters. If `/:jobId` is defined first, Express will match the string `"history"` as a `jobId` parameter. **Always define specific routes before parameterized routes.**
- **Conditional responses**: The job result endpoint returns a different shape based on the job status:
  - `PROCESSING` → `{ status: "PROCESSING", message: "Still running..." }`
  - `FAILED` → `{ status: "FAILED", error: "..." }`
  - `COMPLETED` → `{ status: "COMPLETED", verdict: "FAKE", confidence: 0.78, ... }`
- **Supabase joins**: When fetching a job with its result, you use Supabase's `.select('*, analysis_results(*)')` syntax. This does a SQL JOIN and returns the related `analysis_results` rows nested inside the job object.

### 🔨 What to Build

1. **Create `results.controller.js`**:
   - `getJobResult(req, res, next)`:
     - Read `jobId` from `req.params.jobId` and `userId` from `req.user.id`
     - Call `getJobWithResult(jobId, userId)` from your Supabase service
     - Return different response shapes based on `job.status`
   - `getJobHistory(req, res, next)`:
     - Read `userId` from `req.user.id`
     - Call `getUserJobHistory(userId)` from your Supabase service
     - Return `{ jobs: [...] }`

2. **Create `results.routes.js`**:
   - `GET /history` → `requireAuth` → `getJobHistory` **(define this FIRST)**
   - `GET /:jobId` → `requireAuth` → `getJobResult` **(define this SECOND)**
   - Export the router

3. **Register in `app.js`**: Import and mount at `/api/results`

### ✅ How to Verify

```bash
# Get specific job result
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/results/<jobId-from-earlier>

# Get all history
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/results/history
```

Check:
- ✅ A completed job returns the full verdict and breakdown
- ✅ A processing job returns a "still running" message
- ✅ Requesting another user's job returns an error (not someone else's data)
- ✅ History returns jobs sorted by most recent first

### ➡️ Unlock

All REST endpoints are done. Last feature: bulletproof error handling.

---

---

## Feature 10: Global Error Handling & Validation

### 🎯 Goal

Build a safety net that catches **every** error in your app and returns a clean, consistent JSON response. Also add request validation using Joi so bad requests are rejected early with helpful messages.

### 📁 Files to Create/Edit

```
src/
└── middleware/
    └── error.middleware.js   ← NEW: global error handler
```

Also **edit**: `src/app.js` (register error middleware as the LAST middleware)

### 📦 Libraries Needed

```bash
npm install joi
```

| Library | Why you need it |
|---------|----------------|
| `joi` | Schema-based validation. Define the exact shape of expected request data (types, required fields, min/max values). Returns clear error messages. |

### 🧠 Key Concepts

- **Express error middleware**: Express identifies error handlers by their **4 parameters**: `(err, req, res, next)`. If any route calls `next(err)` or throws inside an async handler, Express skips all normal middleware and jumps straight to the error handler. **It must be the last `app.use()` call.**
- **Multer errors**: Multer throws specific error codes: `LIMIT_FILE_SIZE` (file too big), `LIMIT_UNEXPECTED_FILE` (wrong field name). Your error handler should check for these and return user-friendly messages.
- **Error consistency**: Every error response from your API should have the same shape: `{ error: "message" }`. This makes the frontend's job much easier — it always knows where to find the error message.
- **Joi validation**: You define a schema like `Joi.object({ video_path: Joi.string().required() })` and call `schema.validate(req.body)`. If validation fails, Joi returns a detailed error you can send back. Use this in controllers or as middleware.
- **Never leak stack traces**: In production, never send `err.stack` to the client — it reveals your file paths and internal structure. Only log it on the server side.

### 🔨 What to Build

1. **Create `error.middleware.js`**:
   - Export a function with 4 parameters: `(err, req, res, next)`
   - Log the error using your Winston logger (including stack trace for server-side debugging)
   - Check for specific error types and return appropriate status codes:
     - Multer `LIMIT_FILE_SIZE` → `413` with a file size message
     - Multer file type error → `415` with allowed types
     - Custom errors with `err.statusCode` → use that status code
     - Everything else → `500 Internal Server Error`
   - In production (`NODE_ENV === 'production'`), send a generic message. In development, send the actual error message.

2. **Register in `app.js`**: Add `app.use(errorMiddleware)` as the **very last line** after all routes

3. **(Optional) Add Joi validation to controllers**:
   - Before processing a request, validate `req.body`, `req.params`, or `req.query` using Joi schemas
   - If validation fails, return `400` with the Joi error message
   - Example: in the results controller, validate that `jobId` is a valid UUID format

### ✅ How to Verify

Test every failure path:

```bash
# Upload oversized file → should get 413 with max size message
# Upload wrong file type → should get 415 with allowed types
# Send malformed JSON body → should get 400 (not a crash)
# Hit a non-existent route → should get 404 (add a fallback handler)
# Force an internal error → should get 500 with clean message (not a stack trace)
```

Check your server logs — every error should be logged with a full stack trace for debugging, but the client response should be clean.

### ➡️ Unlock

🎉 **Your backend is feature-complete.** All core functionality is built, tested, and hardened.

---

---

## Final Checklist

After completing all 10 features, verify the complete flow works end-to-end:

```
□ Server starts without errors
□ Health check returns { status: "ok" }
□ Auth verification works with a real Supabase token
□ Video upload stores file in Supabase Storage
□ Upload creates a job in the database with status PROCESSING
□ ML orchestrator calls Python services (or fails gracefully)
□ Aggregator computes correct verdict from scores
□ Results are saved to database
□ Socket.io pushes real-time updates to connected clients
□ Results API returns job status and history
□ All errors return clean JSON responses
□ No console.log in the codebase — all Winston logger
□ No secrets logged or exposed to clients
□ All files use ES modules (import/export)
□ .env.example is committed, .env is gitignored
```

---

## Quick Reference: All Libraries

| Library | Feature | Install |
|---------|---------|---------|
| `express` | 1 | `npm install express` |
| `cors` | 1 | `npm install cors` |
| `dotenv` | 1 | `npm install dotenv` |
| `winston` | 2 | `npm install winston` |
| `@supabase/supabase-js` | 3 | `npm install @supabase/supabase-js` |
| `multer` | 5 | `npm install multer` |
| `axios` | 7 | `npm install axios` |
| `socket.io` | 8 | `npm install socket.io` |
| `joi` | 10 | `npm install joi` |

Or install everything at once:
```bash
npm install express cors dotenv winston @supabase/supabase-js multer axios socket.io joi
```

---

> **Tip:** Don't rush. Spend time on each feature. Read the library docs. Understand *why* each piece exists. This isn't just about making it work — it's about understanding what you've built.
