# MAVEN Backend — Integration Guide

> Everything the **frontend** and **ML model services** need to integrate with the MAVEN backend.

**Base URL:** `http://localhost:4000`
**Protocol:** REST (JSON) + WebSocket (Socket.io)

---

## Table of Contents

- [Authentication](#1-authentication)
- [Video Upload & Analysis](#2-video-upload--analysis)
- [Results API](#3-results-api)
- [Real-Time Updates (Socket.io)](#4-real-time-updates-socketio)
- [ML Model Service Contract](#5-ml-model-service-contract)
- [Database Schema](#6-database-schema)
- [Error Handling](#7-error-handling)
- [Complete Flow Example](#8-complete-flow-example)

---

## 1. Authentication

All protected endpoints require a Supabase JWT token in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

### Public Endpoints (No token required)

---

#### `POST /api/auth/signup`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Success Response — `201 Created`:**
```json
{
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com"
    },
    "session": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "..."
    }
  }
}
```

**Error — `400`:**
```json
{ "error": "Email and password are required" }
```

---

#### `POST /api/auth/login`

Sign in an existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Success Response — `200 OK`:**
```json
{
  "message": "Logged in successfully",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com"
    },
    "session": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "..."
    }
  }
}
```

> **Frontend:** Store `access_token` from the login response. Send it in the `Authorization` header for all subsequent protected requests.

**Error — `401`:**
```json
{ "error": "SignIn Error: Invalid login credentials" }
```

---

#### `POST /api/auth/reset-password`

Send a password reset link to the user's email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success — `200`:**
```json
{ "message": "Password reset link sent to email" }
```

---

### Protected Endpoints (Token required)

---

#### `POST /api/auth/update-password`

Update the authenticated user's password.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "newPassword": "newSecurePassword456"
}
```

**Success — `200`:**
```json
{ "message": "Password updated successfully", "data": { ... } }
```

---

#### `POST /api/auth/logout`

Log out the current user (invalidates the session).

**Headers:** `Authorization: Bearer <token>`

**Success — `200`:**
```json
{ "message": "Logged out successfully" }
```

---

## 2. Video Upload & Analysis

#### `POST /api/analysis/submit`

Upload a video for deepfake analysis. This is the main entry point for the analysis pipeline.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:** `multipart/form-data` with:

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `video` | File | ✅ | Max 5MB, `video/mp4` or `video/webm` only |

**Frontend Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('video', fileInput.files[0]);

const response = await fetch('http://localhost:4000/api/analysis/submit', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
    // Do NOT set Content-Type — browser sets it automatically with boundary
  },
  body: formData
});

const data = await response.json();
// data.jobId → use this to track the analysis
```

**Success Response — `202 Accepted`:**
```json
{
  "message": "Analysis started",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

> **Important:** `202` means "accepted for processing" — the analysis runs in the background. Use the `jobId` to track progress via Socket.io or the Results API.

**Errors:**

| Status | Reason |
|--------|--------|
| `400` | No file uploaded |
| `401` | Missing or invalid auth token |
| `413` | File exceeds 5MB limit |
| `415` | Invalid file type (not mp4/webm) |

---

## 3. Results API

#### `GET /api/results/:jobId`

Fetch the result of a specific analysis job. The response shape changes based on job status.

**Headers:** `Authorization: Bearer <token>`

**URL Params:**

| Param | Type | Format |
|-------|------|--------|
| `jobId` | string | UUID (validated by Joi) |

**Response when `PROCESSING` — `202`:**
```json
{
  "message": "job is processing"
}
```

**Response when `FAILED` — `400`:**
```json
{
  "message": "job has failed, check err message for more details.",
  "error": "FFT service failed with status 503"
}
```

**Response when `COMPLETED` — `200`:**
```json
{
  "message": "job analysis completed",
  "result": {
    "id": "result-uuid",
    "job_id": "job-uuid",
    "verdict": "FAKE",
    "confidence": 0.8234,
    "fft_score": 0.87,
    "liveness_score": 0.91,
    "sync_score": 0.12,
    "details": {
      "verdict": "FAKE",
      "confidence": 0.8234,
      "breakdown": {
        "finalFakeProbability": 0.7134,
        "fft": { "rawScore": 0.87, "unifiedFakeProb": 0.87 },
        "liveness": { "rawScore": 0.91, "unifiedFakeProb": 0.09 },
        "lipsync": { "rawScore": 0.12, "unifiedFakeProb": 0.88 }
      }
    }
  }
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| `400` | Invalid UUID format |
| `401` | Missing or invalid auth token |
| `404` | Job not found (or belongs to another user) |

---

#### `GET /api/results/history`

Fetch the authenticated user's analysis history (last 50 jobs, newest first).

**Headers:** `Authorization: Bearer <token>`

**Success Response — `200`:**
```json
{
  "message": "history found",
  "data": [
    {
      "id": "job-uuid-1",
      "user_id": "user-uuid",
      "video_path": "https://...",
      "status": "COMPLETED",
      "error_message": null,
      "created_at": "2026-04-22T18:00:00.000Z",
      "completed_at": null
    },
    {
      "id": "job-uuid-2",
      "user_id": "user-uuid",
      "video_path": "https://...",
      "status": "FAILED",
      "error_message": "Liveness service failed with status 500",
      "created_at": "2026-04-21T14:00:00.000Z",
      "completed_at": null
    }
  ]
}
```

**When no history exists — `200`:**
```json
{
  "message": "no history found",
  "data": []
}
```

---

## 4. Real-Time Updates (Socket.io)

The backend pushes analysis results to the frontend the instant they're ready via WebSocket. No polling needed.

**Connection URL:** `http://localhost:4000` (same as REST)
**Library:** `socket.io-client`

### Frontend Integration

```javascript
import { io } from 'socket.io-client';

// 1. Connect to the backend
const socket = io('http://localhost:4000');

// 2. After submitting a video and receiving jobId, join the job room
socket.emit('join_job', jobId);

// 3. Listen for the server's room confirmation
socket.on('joined', (roomName) => {
  console.log(`Joined room: ${roomName}`);
});

// 4. Listen for analysis results
socket.on('analysis_complete', (data) => {
  console.log('Analysis complete!', data);
  // data = { jobId, verdict, confidence, breakdown }
});

socket.on('analysis_failed', (data) => {
  console.log('Analysis failed!', data);
  // data = { jobId, message }
});
```

### Socket.io Events Reference

#### Client → Server (Emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `join_job` | `jobId` (string) | Join the room for a specific job to receive updates |

#### Server → Client (Listen)

| Event | Payload | When |
|-------|---------|------|
| `joined` | `roomName` (string) | Confirmation that the client joined the room |
| `analysis_complete` | `{ jobId, verdict, confidence, breakdown }` | Analysis finished successfully |
| `analysis_failed` | `{ jobId, message }` | Analysis failed |

### `analysis_complete` Payload Shape

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "verdict": "FAKE",
  "confidence": 0.8234,
  "breakdown": {
    "finalFakeProbability": 0.7134,
    "fft": { "rawScore": 0.87, "unifiedFakeProb": 0.87 },
    "liveness": { "rawScore": 0.91, "unifiedFakeProb": 0.09 },
    "lipsync": { "rawScore": 0.12, "unifiedFakeProb": 0.88 }
  }
}
```

### `analysis_failed` Payload Shape

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "The analysis failed!"
}
```

---

## 5. ML Model Service Contract

The backend calls **3 Python ML microservices** in parallel. Each service must implement a single endpoint.

### Service URLs (configured via env vars)

| Service | Default URL | Env Variable |
|---------|-------------|-------------|
| FFT (Frequency Analysis) | `http://localhost:8001/analyze` | `FFT_SERVICE_URL` |
| Liveness Detection | `http://localhost:8002/analyze` | `LIVENESS_SERVICE_URL` |
| LipSync Detection | `http://localhost:8003/analyze` | `LIPSYNC_SERVICE_URL` |

### Endpoint Contract: `POST /analyze`

All 3 services receive the **same request** and must return their specific score.

**Request — sent by the backend:**
```json
{
  "video_path": "https://supabase-storage-url.com/signed-url-to-video.mp4"
}
```

> The `video_path` is a **signed URL** (valid for 1 hour) that the ML service can download directly via HTTP GET.

**Timeout:** 2 minutes (120,000ms). If your service takes longer, the request is aborted.

---

### FFT Service Response

```json
{
  "artifact_score": 0.87
}
```

| Field | Type | Range | Meaning |
|-------|------|-------|---------|
| `artifact_score` | float | 0.0 – 1.0 | Probability of being fake (0 = real, 1 = fake) |

---

### Liveness Service Response

```json
{
  "liveness_score": 0.91
}
```

| Field | Type | Range | Meaning |
|-------|------|-------|---------|
| `liveness_score` | float | 0.0 – 1.0 | Authenticity score (0 = fake, 1 = real) — **inverted by backend** |

---

### LipSync Service Response

```json
{
  "sync_score": 0.12
}
```

| Field | Type | Range | Meaning |
|-------|------|-------|---------|
| `sync_score` | float | 0.0 – 1.0 | Authenticity score (0 = fake, 1 = real) — **inverted by backend** |

---

### Score Aggregation Logic

The backend combines the 3 scores using weighted averaging:

```
Weights:  FFT = 30%  |  Liveness = 40%  |  LipSync = 30%

Step 1: Normalize to "fake probability" scale (0=real, 1=fake)
  - FFT:      artifact_score (already on this scale)
  - Liveness: 1 - liveness_score (inverted)
  - LipSync:  1 - sync_score     (inverted)

Step 2: Weighted average
  finalFakeProb = (fft × 0.30) + (liveness × 0.40) + (lipsync × 0.30)

Step 3: Verdict thresholds
  < 0.40  →  REAL
  0.40–0.65  →  UNCERTAIN
  > 0.65  →  FAKE
```

### Error Handling for ML Services

- If any service returns a non-2xx status → the entire job is marked `FAILED`
- If any service times out (>2 min) → the entire job is marked `FAILED`
- The `error_message` column in `analysis_jobs` stores the failure reason
- A `analysis_failed` Socket.io event is emitted to the client

---

## 6. Database Schema

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated, synced from Supabase Auth |
| `email` | TEXT | Unique, not null |
| `first_name` | TEXT | Nullable |
| `last_name` | TEXT | Nullable |
| `created_at` | TIMESTAMPTZ | Auto-generated |

### `analysis_jobs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK → users) | Not null, cascades on delete |
| `video_path` | TEXT | Signed URL to the video in Supabase Storage |
| `status` | TEXT | `PROCESSING`, `COMPLETED`, or `FAILED` |
| `error_message` | TEXT | Null unless status = FAILED |
| `created_at` | TIMESTAMPTZ | Auto-generated |
| `completed_at` | TIMESTAMPTZ | Null until completed |

### `analysis_results`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `job_id` | UUID (FK → analysis_jobs) | Not null, cascades on delete |
| `verdict` | TEXT | `REAL`, `FAKE`, or `UNCERTAIN` |
| `confidence` | FLOAT | 0.0 – 1.0 |
| `fft_score` | FLOAT | Raw FFT artifact_score |
| `liveness_score` | FLOAT | Raw liveness_score |
| `sync_score` | FLOAT | Raw sync_score |
| `details` | JSONB | Full aggregator output (breakdown, probabilities) |

### Row Level Security

All tables have RLS enabled:
- Users can only access their own profile
- Users can only access their own jobs
- Users can only access results for their own jobs

> **Note:** The backend uses a `service_role` key that bypasses RLS for internal operations.

---

## 7. Error Handling

### Consistent Error Format

Every error response from the backend follows this shape:

```json
{ "error": "Human-readable error message" }
```

### Standard Error Codes

| Status Code | Meaning | When |
|-------------|---------|------|
| `400` | Bad Request | Invalid input, validation failure, missing fields |
| `401` | Unauthorized | Missing, expired, or invalid JWT token |
| `404` | Not Found | Route doesn't exist, or resource not found |
| `413` | Payload Too Large | Video file exceeds 5MB limit |
| `415` | Unsupported Media Type | File type not `video/mp4` or `video/webm` |
| `500` | Internal Server Error | Unexpected server error |

### Validation

- `jobId` parameters are validated as **UUID format** before querying the database
- Invalid UUIDs return `400` immediately without hitting the database
- `email` and `password` are required for signup/login (validated in controller)

---

## 8. Complete Flow Example

Here's the full user journey from signup to seeing results:

```
┌──────────────────────────────────────────────────────────────┐
│                      FRONTEND FLOW                           │
└──────────────────────────────────────────────────────────────┘

1. SIGN UP
   POST /api/auth/signup { email, password, firstName, lastName }
   ← 201 { data: { session: { access_token } } }
   💾 Store access_token

2. CONNECT SOCKET
   const socket = io('http://localhost:4000')

3. UPLOAD VIDEO
   POST /api/analysis/submit (multipart/form-data, field: "video")
   Headers: Authorization: Bearer <token>
   ← 202 { jobId: "abc-123" }

4. JOIN JOB ROOM
   socket.emit('join_job', 'abc-123')
   ← socket receives 'joined' event

5. WAIT FOR RESULT (one of two events fires)
   socket.on('analysis_complete', data => { ... })
   socket.on('analysis_failed', data => { ... })

6. (OPTIONAL) FETCH RESULT VIA REST (fallback / page reload)
   GET /api/results/abc-123
   Headers: Authorization: Bearer <token>
   ← 200 { result: { verdict, confidence, ... } }

7. VIEW HISTORY
   GET /api/results/history
   Headers: Authorization: Bearer <token>
   ← 200 { data: [ ...jobs ] }
```

```
┌──────────────────────────────────────────────────────────────┐
│                    ML SERVICE FLOW                            │
└──────────────────────────────────────────────────────────────┘

1. Backend sends POST /analyze with { video_path: "signed-url" }
2. ML service downloads the video from the signed URL
3. ML service runs its analysis model
4. ML service returns the score:
   - FFT:      { "artifact_score": 0.87 }
   - Liveness: { "liveness_score": 0.91 }
   - LipSync:  { "sync_score": 0.12 }
5. Backend aggregates scores and saves to database
```

---

## Health Check

#### `GET /health`

Quick check to verify the server is running.

**Response — `200`:**
```json
{ "status": "ok" }
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Server port |
| `NODE_ENV` | No | `development` | Environment (`development` / `production`) |
| `SUPABASE_URL` | **Yes** | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | **Yes** | — | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | — | Supabase service role key (for admin operations) |
| `FFT_SERVICE_URL` | No | `http://localhost:8001/analyze` | FFT ML service endpoint |
| `LIVENESS_SERVICE_URL` | No | `http://localhost:8002/analyze` | Liveness ML service endpoint |
| `LIPSYNC_SERVICE_URL` | No | `http://localhost:8003/analyze` | LipSync ML service endpoint |
