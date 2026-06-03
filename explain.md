# MAVEN — Multimodal Audio-Visual Examination Network
## Exhaustive Technical Design Document

> Prepared for: Senior Engineers · Technical Interviewers · Hackathon Judges · Open-Source Contributors · Startup CTOs  
> Author: Principal Engineer Review  
> Version: 2.0 (Corrected from codebase analysis)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Analysis](#2-problem-analysis)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack Justification](#4-technology-stack-justification)
5. [Detailed Module Breakdown](#5-detailed-module-breakdown)
6. [Database Design](#6-database-design)
7. [API Design](#7-api-design)
8. [Frontend Design Decisions](#8-frontend-design-decisions)
9. [Backend Design Decisions](#9-backend-design-decisions)
10. [Security Analysis](#10-security-analysis)
11. [Performance Engineering](#11-performance-engineering)
12. [Scalability Analysis](#12-scalability-analysis)
13. [Development Workflow](#13-development-workflow)
14. [Tradeoff Analysis](#14-tradeoff-analysis)
15. [Interview Questions & Model Answers](#15-interview-questions--model-answers)
16. [Future Improvements](#16-future-improvements)
17. [Critical Review](#17-critical-review)
18. [Final Architecture Evaluation](#18-final-architecture-evaluation)

---

## 1. Executive Summary

### Project Overview

MAVEN (Multimodal Audio-Visual Examination Network) is a full-stack deepfake forensics platform that analyzes video content through three independent and complementary detection pipelines: a multi-model frequency/visual artifact analysis pipeline, physiological liveness detection, and audio-visual cross-modal lip-sync scoring. The system returns a confidence-weighted verdict (REAL / FAKE / UNCERTAIN) with per-layer explainability.

### Problem Being Solved

Synthetic media — videos where a person's face or voice is replaced or manipulated using AI — has become indistinguishable to the human eye. Deepfakes now threaten personal reputation (non-consensual face swaps), political stability (fabricated politician videos), financial systems (identity fraud), and judicial proceedings (tampered evidence). The core technical problem is: **how do you detect AI-generated video at inference time, at scale, with explainability?**

### Target Users

- Journalists and fact-checkers verifying viral video authenticity
- Legal and forensics professionals requiring evidence integrity
- Social media platforms doing pre-publish content moderation
- Enterprise security teams verifying video-based KYC/identity claims
- Researchers benchmarking detection methodologies

### Existing Solutions in the Market

| Solution | Type | Limitation |
|---|---|---|
| Microsoft Video Authenticator | Binary classifier | No explainability, closed-source, deprecated |
| Sensity AI | API | Enterprise-only, expensive, black box |
| FakeCatcher (Intel) | rPPG-based | Single-modality, no audio-visual cross-check |
| Deepware Scanner | Mobile app | No API, no integration capability |
| Hive Moderation API | Cloud API | Purely visual, no audio correlation |

### How MAVEN Solves These Limitations

MAVEN's core insight is that **no single deepfake generator defeats all three detection vectors simultaneously**. A GAN-generated face may have perfect lip sync but leave spectral artifacts. An audio-dubbing attack may have clean video but fail the rPPG pulse check. MAVEN exploits this by running three independent forensic layers and fusing scores — making adversarial evasion exponentially harder than defeating any single detector. Additionally, it is fully open-source with a self-hostable deployment and a structured explainability output per analysis.

### Key Innovations

1. **Four-signal score fusion** with dynamic confidence-weighted aggregation and model agreement scoring
2. **Dual-model FFT service**: dima806 ViT (HuggingFace) + selimsef DFDC EfficientNet B7 NS (Kaggle competition winner) as anchor models, plus spectral FFT, color consistency, and temporal coherence signals
3. **Multi-region rPPG** using the CHROM algorithm on three independent skin ROIs (forehead, left cheek, right cheek) from MediaPipe landmarks, with cross-correlation and harmonic verification
4. **Wav2Lip SyncNet discriminator** for 5-frame sliding window lip-sync scoring with percentile-based robust aggregation
5. **Temporal consistency analysis** from ViT [CLS] token embeddings measuring frame-to-frame identity coherence
6. **Supabase Realtime + Socket.io dual push**: Socket.io fires immediately from Node.js; Supabase Realtime CDC provides confirmation via PostgreSQL replication
7. **Docker-orchestrated polyglot architecture** (Node.js backend + 3 Python ML microservices + Nginx) behind a single reverse proxy

---

## 2. Problem Analysis

### Exact Problem Statement

A deepfake video can be created in under an hour using open-source tools (DeepFaceLab, FaceSwap, Wav2Lip, SadTalker). The detection problem is fundamentally asymmetric: generating takes compute, but detecting requires understanding the statistical fingerprints left by every generative model class. MAVEN addresses this as a **binary forensic classification problem** with confidence scoring.

### Why the Problem Matters

- In 2024, a deepfake video of a Hong Kong bank employee was used to defraud $25M USD via a video conference call
- Political deepfakes surfaced during multiple national elections (India, USA, Bangladesh) in 2024
- Synthetic voice/video fraud is the fastest-growing attack vector in KYC bypasses
- Courts in multiple jurisdictions have begun rejecting video evidence without authenticity certificates

### Technical Challenges

**1. Generalization Across Generator Architectures**  
Each generative model (StyleGAN, FaceSwap, Wav2Lip, Stable Diffusion + IP-Adapter, Sora, Kling, Veo) leaves different spectral fingerprints. A detector trained on FaceForensics++ may fail on Celeb-DF v2 videos or modern diffusion-based generators. MAVEN mitigates this by using **complementary features** — a trained ViT classifier, a competition-winning EfficientNet, spectral, color, physiological, and temporal signals — that together cover a wider generator-class surface.

**2. Real-Time Inference Constraints**  
A 30-second 720p video at 25fps is 750 frames. Frame sampling, ViT inference (~300ms/frame on CPU), DFDC EfficientNet inference on 20 frames, MediaPipe landmark detection, and transformer scoring must complete in reasonable time. Frame sampling strategies and model weight pre-loading are used to manage this.

**3. False Positive Rate**  
Over-aggressive thresholds flag real videos as fake, which destroys trust. The DFDC EfficientNet B7 NS model is specifically used as an "anchor" signal because it produces near-zero scores (0.005–0.02) on real video regardless of compression, avoiding the false-positive bias that plagues the ViT model on mobile-compressed video (H.265/HEVC). The three-tier verdict (REAL / UNCERTAIN / FAKE) avoids forcing binary confidence where the system is uncertain.

**4. Out-of-Domain Content**  
The DFDC EfficientNet was trained on 2020-era face-swap deepfakes. Modern diffusion-based generators (Sora, Kling, Veo) produce content the model has never seen, causing near-zero DFDC scores even for clear fakes. The aggregator implements a specific out-of-domain detection path: when DFDC returns near-zero AND ViT returns elevated scores, the ViT weight is elevated because DFDC has no meaningful opinion on that content type.

**5. Audio-Video Alignment**  
Lip sync analysis requires frame-accurate alignment between the audio stream and video frames. FFmpeg extraction, mel spectrogram computation (80 mel bins × 16 time steps per window), and 5-frame video windows must be temporally consistent.

### User Pain Points

- No open-source tool provides **all three forensic layers** in a single API call
- No existing free tool provides **per-segment timeline** explainability (which time window is suspicious)
- No tool integrates **physiological liveness** with spectral and sync analysis together
- All enterprise tools are **black boxes** — no confidence breakdown per detection axis

---

## 3. System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     User (Browser)                               │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS (Nginx Reverse Proxy :80)
┌──────────────────────────▼───────────────────────────────────────┐
│                     Nginx (Reverse Proxy)                        │
│   /api/*  → backend:4000   |   /*  → frontend:5173              │
└──────────┬──────────────────────────────────────────────────────-┘
           │
    ┌──────▼──────┐          ┌──────────────────────────────┐
    │  Node.js    │◄────────►│      Supabase (Managed)      │
    │  Backend    │          │  PostgreSQL · Auth · Storage  │
    │  :4000      │          │  Realtime Pub/Sub            │
    └──────┬──────┘          └──────────────────────────────┘
           │ Internal HTTP (Docker network) + Socket.io
    ┌──────┼──────────────────────────────────┐
    │      │                                  │
    ▼      ▼                                  ▼
┌──────┐ ┌────────┐                  ┌──────────────┐
│ FFT  │ │Liveness│                  │  LipSync     │
│ :8001│ │ :8002  │                  │  :8003       │
│(ViT+ │ │(CHROM  │                  │(Wav2Lip      │
│DFDC) │ │+Blink) │                  │ SyncNet)     │
└──────┘ └────────┘                  └──────────────┘
```

### Component Interaction

| Component | Communicates With | Protocol | Direction |
|---|---|---|---|
| React Frontend | Node.js Backend | REST HTTP | Bidirectional |
| React Frontend | Supabase | WebSocket (Realtime) | Subscribe only |
| React Frontend | Node.js Backend | Socket.io | Subscribe only |
| Node.js Backend | Supabase DB | Supabase SDK (HTTP) | Read/Write |
| Node.js Backend | Supabase Storage | Supabase SDK (HTTP) | Write |
| Node.js Backend | FFT Service | HTTP POST (native fetch) | Fan-out |
| Node.js Backend | Liveness Service | HTTP POST (native fetch) | Fan-out |
| Node.js Backend | LipSync Service | HTTP POST (native fetch) | Fan-out |
| Node.js Backend | React | Socket.io (WS) | Push notifications |

### Request Flow (Video Analysis)

```
1. User selects video on /analyze page
2. React sends multipart/form-data POST to /api/analysis/submit (with Supabase JWT)
3. requireAuth middleware validates JWT via supabase.auth.getUser(token)
4. upload.middleware.js (Multer memoryStorage) buffers file in RAM
5. analysis.controller.js:
   a. ensureUserProfile() → upserts user row in public.users (handles missing trigger)
   b. uploadVideoToStorage() → uploads buffer to Supabase Storage "maven-videos" bucket
   c. createAnalysisJob() → generates 1-hour signed URL from private bucket, inserts
      analysis_jobs row (status=PROCESSING, video_path = signed URL) → returns jobId
   d. Returns HTTP 202 {jobId} to React immediately
   e. Calls runMLAnalysis(signedUrl, jobId) asynchronously (fire-and-forget .catch())
6. runMLAnalysis fans out to 3 Python services via Promise.all() using native fetch:
   - POST fft-service:8001/analyze     { video_path: signedUrl, max_frames: 15 }
   - POST liveness-service:8002/analyze { video_url: signedUrl, job_id: jobId }
   - POST lipsync-service:8003/analyze  { video_url: signedUrl, job_id: jobId }
   A 10-minute AbortController timeout governs all three requests.
7. Each Python service:
   a. Downloads video from the signed URL to a local temp file
   b. Runs ML pipeline
   c. Returns JSON score object
   d. Deletes temp file in finally block
8. computeFinalVerdict() in aggregator.js fuses 4 signals (FFT + liveness + lipsync + temporal)
   with dynamic, confidence-weighted scoring → verdict
9. saveAnalysisResult() writes to analysis_results + updates analysis_jobs (status=COMPLETED)
10. Socket.io emits "analysis_complete" to room "job:{jobId}"
11. Supabase Realtime publishes Postgres CDC UPDATE event on analysis_jobs (arrives ~100–500ms later)
12. React navigates to /result/:jobId → fetches GET /api/analysis/jobs/:id → renders result
```

### Data Flow

```
Video bytes → Supabase Storage bucket "maven-videos" (private)
             → Node.js (temp buffer in RAM via Multer memoryStorage, never persisted to disk)
             → Signed URL (1-hour TTL) stored in analysis_jobs.video_path
             → Python services (download signed URL → local temp file → delete after analysis)
             → Score JSON → aggregation → analysis_results.details (JSONB)
             → React (fetched on result page load via GET /api/analysis/jobs/:id)
```

### State Flow

```
Job States:  PROCESSING → COMPLETED
                         → FAILED (with error_message string)

React UI States:
  /analyze  →  [upload pending]  →  waiting for Socket.io "analysis_complete"
  → COMPLETED → navigate to /result/:jobId
  → FAILED    → show error state

Socket.io room per job: "job:{jobId}"
  Events:
    "analysis_complete" → { jobId, verdict, confidence, breakdown }
    "analysis_failed"   → { jobId, message }
```

---

## 4. Technology Stack Justification

### React 18 (Frontend Framework)

**What it is:** Declarative UI library with component model, virtual DOM, and concurrent rendering features.

**Why selected:** The result page requires multiple independent real-time chart updates (rPPG signal display, radar chart, sync timeline) without full-page re-renders. React's fine-grained component update model is optimal for this. The Supabase JS client has first-class React hooks support.

**Styling:** The frontend uses **TailwindCSS v3** (via `tailwind.config.js`, `postcss.config.js`) for utility-class styling, plus Framer Motion for animations, and lucide-react for icons.

**Advantages:** Huge ecosystem (Recharts, Framer Motion, lucide-react), Vite integration, concurrent features (Suspense for async data loading).

**Limitations:** Not a full framework — routing, state management, and data-fetching are separate concerns requiring additional libraries.

**Alternatives considered:**
- **Next.js:** Server-side rendering unnecessary for an authenticated SPA where all data is user-specific. SSR would add complexity without benefit.
- **Vue 3:** Comparable capability, but React ecosystem better aligns with industry standard and interviewer expectations.
- **SvelteKit:** Excellent performance, but smaller ecosystem and less MediaPipe/Recharts integration precedent.

---

### Node.js / Express 5 (Backend Orchestrator)

**What it is:** JavaScript runtime on V8, Express 5 is a minimal HTTP framework (uses `^5.2.1`).

**Why selected:** The backend's primary role is **I/O orchestration** — it fans out to 3 Python services in parallel, aggregates results, and writes to Supabase. This is a workload dominated by I/O wait, not CPU computation. Node.js's event-loop model with `Promise.all()` is precisely optimized for this fan-out pattern.

**HTTP client:** The orchestrator uses **Node.js native `fetch`** (not Axios). ML service calls are made with the built-in `fetch` API guarded by an `AbortController` with a 10-minute timeout.

**Advantages:** Non-blocking I/O handles concurrent analysis jobs without thread-per-request overhead. Shares JavaScript language with frontend.

**Limitations:** CPU-bound tasks (ML inference) would be a bottleneck — but ML is offloaded to Python services entirely, making this a non-issue.

**Alternatives considered:**
- **Golang (Gin/Fiber):** Superior concurrency with goroutines. Rejected because language switching adds overhead for a solo developer, and the fan-out pattern is just as elegant in Node.js `Promise.all`.
- **Python FastAPI (single service):** Would eliminate the language boundary. Rejected because Python's GIL limits true parallelism for I/O-heavy fan-out.
- **Rust (Axum):** Best possible performance, but over-engineered for this scope.

---

### Python FastAPI (ML Microservices)

**What it is:** Modern async Python web framework with automatic OpenAPI docs, Pydantic validation, and excellent async support via Uvicorn/ASGI.

**Why selected:** The ML stack (PyTorch, OpenCV, MediaPipe, NumPy, HuggingFace Transformers) is Python-native. No other language has comparable ML library support. FastAPI over Flask because it is async-first, has automatic request validation via Pydantic, and generates `/docs` Swagger UI for free.

**Advantages:** Native PyTorch/CUDA integration, automatic OpenAPI documentation, Pydantic type safety on ML service inputs/outputs.

**Limitations:** Python GIL limits CPU parallelism within a single service instance. Mitigated by running each service as a separate process.

---

### ML Models (FFT Service)

The FFT service implements a **dual-model pipeline** with 6 signals:

**Model A — dima806 ViT (`deepfake_vs_real_image_detection`)**
- HuggingFace image classification pipeline
- Runs frame-by-frame on face crops
- Outputs calibrated fake probability per frame
- A piecewise linear calibration corrects for systematic ~50–56% bias on mobile-compressed (H.265) real video
- The ViT [CLS] token embedding is extracted simultaneously for temporal consistency analysis

**Model B — selimsef DFDC EfficientNet B7 NS (Kaggle winner)**
- EfficientNet B7 Noisy Student architecture trained on DFDC competition data
- Weights auto-downloaded from GitHub releases (~255 MB) on first use
- 20 evenly-sampled frames with Test-Time Augmentation (horizontal flip)
- Trimmed mean aggregation (drops top/bottom 2 frames)
- Near-zero output (0.005–0.02) on real video regardless of compression → used as the **anchor signal**

**Additional signals per frame:**
- **Spectral analysis (2D FFT):** `compute_spectral_fake_score()` — high-frequency artifact detection
- **Color consistency:** `compute_color_mismatch_score()` — face-vs-background color distribution mismatch
- **Texture heuristic:** Laplacian variance + Sobel gradient smoothness — AI faces are over-smoothed
- **Temporal consistency:** Cosine similarity between consecutive ViT [CLS] embeddings via `compute_temporal_consistency()`

**Final blend weights by model agreement state:**
- DFDC REAL + ViT REAL: 45% DFDC + 20% ViT + 10% spectral + 10% temporal + 15% color
- DFDC FAKE + ViT FAKE: 40% DFDC + 25% ViT + 10% spectral + 10% temporal + 15% color
- DFDC REAL + ViT FAKE (disagreement): trust DFDC (55% DFDC weight); unless DFDC < 0.05 AND ViT > 0.65 (out-of-domain diffusion content), in which case elevate ViT
- DFDC unavailable fallback: 40% ViT + 20% spectral + 20% temporal + 20% color

**Note on `models/cnn_classifier.py`:** A `SpectralCNN` architecture exists (Conv2d CNN on 256×256 log-magnitude FFT spectra) with a `bootstrap_cnn_weights.py` script. However, this CNN is **not part of the active inference pipeline** — it is a development baseline. The active pipeline uses the ViT + DFDC EfficientNet approach described above.

---

### PyTorch 2.x

**What it is:** Deep learning framework by Meta with dynamic computation graphs.

**Why selected:** Custom model architectures (DFDC DeepFakeClassifier wrapping EfficientNet B7, SpectralCNN, SyncNet_color) require dynamic graphs for debugging and iteration. `torch.nn.functional.normalize` provides L2 normalization for the SyncNet cosine similarity computation. `timm` provides the EfficientNet backbone.

**Alternatives considered:**
- **TensorFlow/Keras:** Static graph model is inferior for custom architecture iteration.
- **ONNX Runtime (inference only):** Considered for production inference optimization. Worth doing before production deployment.

---

### MediaPipe

**What it is:** Google's cross-platform framework for real-time ML pipelines, specifically face mesh (478 3D landmarks in newer models), and the new Tasks API.

**Current version:** `mediapipe==0.10.33` (pinned in liveness and lipsync requirements).

**Important:** The liveness and lipsync services use **MediaPipe's new Tasks API** (`mediapipe.tasks.python.vision.FaceLandmarker`) with a `.task` model file (`face_landmarker.task`), not the legacy `mp.solutions.face_mesh` API. This is a significant implementation detail.

**Usage per service:**
- **Liveness service:** `create_face_landmarker()` (Tasks API) for rPPG ROI extraction across forehead and both cheeks
- **LipSync service:** `create_face_landmarker()` (Tasks API) for outer lip landmark extraction (30-point `LIP_OUTER` list), then bounding box crop at 96×96 px

**Alternatives considered:**
- **Dlib:** 68-point landmark model — insufficient landmarks and lower accuracy.
- **OpenCV DNN face detector:** No landmark capability.
- **InsightFace:** Excellent accuracy but heavier dependency, harder to integrate.

---

### Supabase

**What it is:** Open-source Firebase alternative — PostgreSQL database, Auth, object Storage, and Realtime pub/sub, all managed.

**Why selected:** MAVEN needs four separate infrastructure pieces: user auth, video file storage, relational job/result storage, and real-time push to the frontend when analysis completes. Supabase provides all four with a single vendor, single SDK, and Row Level Security (RLS) at the database layer.

**Key implementation detail:** The `maven-videos` storage bucket is **private**. The backend generates a **1-hour signed URL** when creating the analysis job, and this signed URL is stored as `video_path` in `analysis_jobs`. The Python services download the video using this signed URL — they never have direct bucket access.

**Advantages:** RLS means user data isolation is enforced at the database level, not the application layer. Free tier sufficient for development and demo. One SDK in frontend for auth + realtime.

**Limitations:** Vendor lock-in on Realtime architecture. At very high scale (>10k concurrent users), self-hosted Supabase or migrating to a dedicated queue (Redis Pub/Sub, Kafka) would be necessary.

---

### Socket.io

**What it is:** WebSocket abstraction library with fallback to long-polling.

**Role in MAVEN:** Primary low-latency push mechanism. When analysis completes, `getIO().to('job:{jobId}').emit('analysis_complete', {...})` fires immediately from the Node.js process. This is faster than waiting for Supabase Realtime CDC propagation (~100–500ms).

**Frontend:** The frontend uses `socket.io-client` to subscribe to job-specific rooms. Both the backend (`socket.io@^4.8.3`) and frontend (`socket.io-client@^4.8.3`) are installed.

**`socket.js`:** A module-level singleton pattern (`getIO()`) makes the Socket.io instance available across all backend modules without circular dependencies.

---

### Docker + Docker Compose

**What it is:** Container runtime and multi-container orchestration tool.

**Note:** The `docker-compose.yml` file in the repository is currently empty. The Docker orchestration described in documentation reflects the intended production setup. Individual Python services run with `.venv` virtual environments during development.

**Intended services:**
- `frontend` (Vite dev server :5173)
- `backend` (Node.js :4000)
- `fft-service` (Uvicorn :8001)
- `liveness-service` (Uvicorn :8002)
- `lipsync-service` (Uvicorn :8003)
- `nginx` (reverse proxy :80)

---

### Nginx (Reverse Proxy)

**What it is:** High-performance HTTP server and reverse proxy.

**Why selected:** Provides a single ingress point. Routes `/api/*` to the Node.js backend and `/*` to the Vite frontend. The `nginx.conf` file exists at the project root.

---

## 5. Detailed Module Breakdown

### Module 1: Auth Middleware (`backend/src/middleware/auth.middleware.js`)

**Purpose:** Validate Supabase JWTs on all protected endpoints.

**Internal Design:** Extracts the Bearer token from `Authorization` header and calls `supabase.auth.getUser(token)`. The validated user object is attached to `req.user` for downstream controller use.

**Why not JWT decode locally?** Local JWT verification requires securely storing the JWT secret and handling token refresh edge cases. Delegating to Supabase's `getUser()` ensures revoked tokens (e.g., after password change) are correctly rejected.

**Edge Cases:**
- Expired JWT: Supabase returns an error → 401
- Malformed/missing header: caught by `startsWith('Bearer ')` guard → 401
- Internal error: caught in try/catch → 500

**Data Structures:**
```javascript
req.user = {
  id: "uuid",
  email: "user@example.com",
  user_metadata: { first_name: "...", last_name: "..." }
  // ... full Supabase user object
}
```

---

### Module 2: ML Orchestrator (`backend/src/services/mlOrchestrator.js`)

**Purpose:** Fan-out analysis job to 3 ML microservices in parallel; aggregate results; persist to Supabase; emit Socket.io event.

**Internal Design:** Uses native `fetch` with `Promise.all()` for true parallel execution of 3 HTTP calls. A single `AbortController` governs all three requests with a **10-minute timeout**. Uses `getIO().to('job:{jobId}')` for Socket.io room-based push.

**Key parameter difference:** The FFT service receives `{ video_path, max_frames: 15 }` while liveness and lipsync services receive `{ video_url, job_id }`. All three receive the same Supabase signed URL, but with different field names matching each service's Pydantic schema.

**Failure Modes:**
- **Partial failure** (one of three services fails): Fails the entire job. Improvement: allow partial results with degraded confidence score.
- **Timeout:** `AbortController` aborts all pending requests after 10 minutes → job marked FAILED.
- **Service unavailable:** `fetch` throws ECONNREFUSED. Caught → job marked FAILED.

---

### Module 3: Score Aggregator (`backend/src/services/aggregator.js`)

**Purpose:** Convert scores from 3 ML services (including temporal data from FFT service) into a fused verdict with confidence.

**This is significantly more sophisticated than a simple weighted average.** The actual aggregation algorithm:

**Step 1 — Convert to unified fake probability scale [0=real, 1=fake]:**
```
fftFakeProb      = fftResult.artifact_score
livenessFakeProb = 1 - livenessResult.liveness_score
lipsyncFakeProb  = 1 - lipsyncResult.sync_score
temporalFakeProb = 1 - fftResult.temporal_consistency.temporal_consistency_score
```

**Step 2 — Dynamic base weights** (4 cases based on data availability):

| Condition | fftW | livenessW | lipsyncW | temporalW |
|---|---|---|---|---|
| No temporal + LipSync no data | 0.70 | 0.30 | 0.00 | 0.00 |
| No temporal + LipSync uncertain | 0.55 | 0.15 | 0.30 | 0.00 |
| No temporal + LipSync available | 0.50 | 0.15 | 0.35 | 0.00 |
| Temporal + LipSync no data | 0.55 | 0.30 | 0.00 | 0.15 |
| Temporal + LipSync uncertain | 0.40 | 0.15 | 0.30 | 0.15 |
| Temporal + LipSync available | 0.35 | 0.15 | 0.35 | 0.15 |

LipSync is treated as "no data" when `weights_loaded === false`, verdict is `"NO_SPEECH_DETECTED"`, or verdict is `"INSUFFICIENT_DATA"`.

**Step 3 — Confidence boost** (scales each model's weight by distance from neutral 0.5):
```
confidence_i = |score_i - 0.5| × 2   → [0, 1]
adj_weight_i = base_weight_i × (1.0 + 0.30 × confidence_i)
# Normalize adjusted weights to sum to 1.0
```

**Step 4 — Model agreement scoring:**
- Count models "leaning fake" (score > 0.55) and "leaning real" (score < 0.40, with data)
- 3+ models lean fake → +0.08 boost
- 2+ models lean fake → +0.04 boost
- 1 leans fake + 2+ lean real → -0.06 dampen

**Step 5 — Additional boosts:**
- FFT uncertain (≥0.45) + LipSync UNCERTAIN verdict → +0.06
- Suspicious frames ratio ≥ 95% → +0.08
- Temporal consistency score < 0.4 → +0.05
- Temporal jitter score > 0.6 → +0.04

**Step 6 — Verdict thresholds (expanded UNCERTAIN band):**
```
finalFakeProb < 0.40  → "REAL"
finalFakeProb > 0.60  → "FAKE"
else                  → "UNCERTAIN"
```

**Step 7 — Hard overrides:**
- FFT > 0.65 AND LipSync > 0.55 → force "FAKE"
- 3+ models lean fake AND finalFakeProb > 0.50 → force "FAKE"
- FFT < 0.25 AND liveness < 0.25 AND lipsync < 0.35 → force "REAL"
- 3+ models lean real AND finalFakeProb < 0.45 → force "REAL"

**Confidence output:** `verdict === "REAL" ? 1 - finalFakeProb : finalFakeProb`

---

### Module 4: FFT Service (`ml-services/fft_service/`)

**Key files:**
- `analyzer.py` — Main dual-model inference pipeline
- `selimsef_predictor.py` — DFDC EfficientNet B7 NS wrapper
- `spectral_analyzer.py` — 2D FFT frequency-domain analysis
- `color_consistency.py` — Face-background color mismatch scoring
- `temporal_analyzer.py` — ViT [CLS] embedding cosine similarity analysis
- `bootstrap_cnn_weights.py` — Generates synthetic bootstrap weights for SpectralCNN (not used in main pipeline)
- `models/cnn_classifier.py` — SpectralCNN architecture (development baseline, not in active pipeline)

**Pipeline summary:**
1. Frame sampling: `np.linspace(0, total_frames-1, max_frames)` — evenly distributed across full video
2. Per frame: face crop (Haar cascade) → ViT forward pass (calibrated score + [CLS] embedding) + texture heuristic + spectral FFT + color mismatch
3. DFDC EfficientNet B7 NS: 20 evenly-sampled frames with TTA (horizontal flip) → trimmed mean
4. Temporal consistency: sliding window cosine similarity of [CLS] embeddings
5. Final blend by model agreement state (as documented above)

**ViT calibration:**
The `dima806/deepfake_vs_real_image_detection` model outputs ~50–56% fake probability for real mobile-compressed video (H.265). A piecewise linear calibration corrects this:
- `[0, 0.58]` → `[0, 0.42]` (compress ambiguous zone toward real)
- `[0.58, 1.0]` → `[0.42, 1.0]` (preserve genuine fake signals)

**Output schema:**
```python
{
    "artifact_score": float,           # overall fake probability [0=real, 1=fake]
    "high_freq_ratio": float,          # mean per-frame ViT blend score
    "suspicious_frames": list[int],    # frame indices > SUSPICIOUS_THRESHOLD (0.60)
    "total_frames_analyzed": int,
    "frame_scores": list[float],       # per-frame scores (capped at 200)
    "verdict": "REAL" | "UNCERTAIN" | "FAKE",
    "temporal_consistency": {
        "temporal_consistency_score": float,
        "worst_window": {"start_frame", "end_frame", "score"} | None,
        "window_scores": [...],
        "n_frames": int,
        "jitter_score": float          # variance of window scores
    }
}
```

---

### Module 5: rPPG + Blink Service (`ml-services/liveness_service/`)

**Key files:**
- `main.py` — FastAPI app, score fusion (0.70 × rPPG + 0.30 × blink)
- `rppg.py` — Multi-region CHROM algorithm
- `blink_detector.py` — EAR-based blink analysis with 4 sub-metrics
- `face_landmarker.py` — Shared MediaPipe Tasks API wrapper

**rPPG Pipeline (CHROM Algorithm — Multi-Region):**

Unlike a single-ROI approach, MAVEN extracts rPPG from **three independent skin regions** simultaneously:
- **Forehead:** landmarks `[10, 338, 297, 332, 284, 251, 389]`
- **Left cheek:** landmarks `[234, 127, 162, 21, 54, 103, 67, 109]`
- **Right cheek:** landmarks `[454, 356, 389, 251, 284, 332, 297, 338]`

Per-region CHROM processing:
1. Extract convex hull mask from landmarks → mean RGB per frame → time series [R(t), G(t), B(t)]
2. Apply CHROM decomposition:
   - `Xs = 3R - 2G`
   - `Ys = 1.5R + G - 1.5B`
   - `rPPG = Xs - (σXs/σYs) × Ys`
3. Bandpass filter 0.75–3.0 Hz (45–180 BPM physiological range) — 3rd-order Butterworth
4. FFT → dominant frequency → estimated HR
5. SNR-based quality score: `min(1.0, peak_amplitude / mean_amplitude / 10.0)`

**Cross-correlation scoring:** All pairs of region signals are Pearson-correlated. Real heartbeats appear in all regions simultaneously → high correlation. Deepfake noise is uncorrelated across regions → low correlation.

**Harmonic verification:** Real cardiac signals exhibit a 2nd harmonic (2× dominant frequency) due to non-sinusoidal pulse waveform shape. A check verifies harmonic peak ≥ 15% of fundamental amplitude.

**Final quality score:**
```
final_quality = 0.50 × best_SNR_quality + 0.30 × cross_correlation + 0.20 × harmonic_bonus
harmonic_bonus = 1.0 if harmonic_present else 0.3
```

**Minimum frames:** 100 frames (≈4 seconds at 25fps) required for reliable HR estimation.

**Blink Detection (EAR):**
`EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)` — threshold at 0.20 for blink detection.

The blink detector (`blink_detector.py`) computes 4 sub-metrics: regularity (natural inter-blink variability), IBI score (inter-blink interval consistency), duration score (normal blinks last 100–400ms), and waveform score (smooth EAR curve shape).

**Final liveness score fusion (in `main.py`):**
```
rppg_score = rppg["signal_quality"] if rppg["pulse_present"] else 0.15
blink_score = blink["regularity_score"]
liveness_score = 0.70 × rppg_score + 0.30 × blink_score

# Floor: strong pulse → liveness ≥ 0.65
if rppg.pulse_present and rppg.signal_quality > 0.8:
    liveness_score = max(liveness_score, 0.65)

# Boost: high cross-correlation → liveness ≥ 0.70
if rppg.pulse_present and cross_correlation > 0.75:
    liveness_score = max(liveness_score, 0.70)
```

**Edge Cases:**
- Glasses: EAR calculation distorted by frame reflections
- Side-facing video: Face ROI may not be visible
- Compressed video: Block artifacts corrupt rPPG signal quality
- Short clips (<4 seconds/100 frames): Returns `signal_quality=0.1`, `pulse_present=False`

---

### Module 6: LipSync Service (`ml-services/lipsync_service/`)

**Key files:**
- `main.py` — FastAPI app, download + analyze flow
- `cross_modal_transformer.py` — Wav2Lip SyncNet implementation + `analyze_lipsync()`
- `audio_processor.py` — FFmpeg audio extraction + mel spectrogram
- `lip_tracker.py` — (utility)

**Important:** Despite the file being named `cross_modal_transformer.py`, the actual architecture implemented is the **Wav2Lip SyncNet discriminator** (`SyncNet_color` class), not a custom cross-modal transformer. The architecture is the exact Prajwal et al. (ACM MM 2020) design.

**SyncNet Architecture (`SyncNet_color`):**
```
face_encoder:  (B, 15, H, W) → (B, 512)
  Input: 5 RGB frames stacked on channel dim (5×3=15 channels)
  Sequence of Conv2d blocks with BatchNorm + ReLU (some with residual connections)
  Final output: 512-dim L2-normalized vector

audio_encoder: (B, 1, 80, 16) → (B, 512)
  Input: 80-bin mel spectrogram slice, 16 time steps
  Sequence of Conv2d blocks with BatchNorm + ReLU (some with residual connections)
  Final output: 512-dim L2-normalized vector

Output: cosine_similarity(face_embedding, audio_embedding) → sync score per window
```

**Weights:** Loaded from `lipsync_expert.pth` (Wav2Lip pre-trained SyncNet checkpoint). If weights are missing, the service runs with random weights and sets `weights_loaded=false` in the response — the aggregator treats this as NO_SPEECH/INSUFFICIENT_DATA (zero weight).

**Inference pipeline:**
1. Audio extraction via FFmpeg → 16kHz mono WAV → 80-bin mel spectrogram
2. Lip crop extraction: MediaPipe Tasks API FaceLandmarker → 30-point `LIP_OUTER` mask → 96×96 px crop per frame
3. Sliding window inference (stride=1, window=5 frames):
   - Prepare video tensor: lower half of 5 lip crops stacked on channel dim → (15, 48, 96)
   - Prepare audio tensor: mel slice resized to (80, 16) via `skimage.transform.resize`
   - Skip silent windows (RMS < 0.01)
   - Lip motion check: static mouth during active speech → 40% score penalty
   - SyncNet → cosine similarity → sigmoid → window score
4. Robust scoring: `0.50 × mean + 0.30 × p25 + 0.20 × median`
5. Consecutive-bad-window penalty: ≥5 consecutive windows < 0.30 AND > 5% of total → penalty up to 0.08
6. Speech-energy weighting: `0.70 × robust_score + 0.30 × energy_weighted_score`
7. Verdict thresholds: < 0.35 → OUT_OF_SYNC, < 0.50 → UNCERTAIN, else → IN_SYNC
8. Merge adjacent flagged segments (gap < 0.5s) → capped at 10 entries

**Output schema:**
```python
{
    "sync_score": float,            # [0=out-of-sync/fake, 1=in-sync/real]
    "verdict": "IN_SYNC" | "UNCERTAIN" | "OUT_OF_SYNC" | "NO_SPEECH_DETECTED" | "INSUFFICIENT_DATA",
    "flagged_segments": [{"start_sec", "end_sec", "score"}, ...],  # up to 10
    "windows_analyzed": int,
    "weights_loaded": bool
}
```

---

## 6. Database Design

### Why PostgreSQL (via Supabase)?

The data model has clear relational structure: each user has many jobs; each job has exactly one result; results reference jobs via foreign key. PostgreSQL provides:
- Strong consistency for job status updates (critical for correctness)
- JSONB column for flexible `details` storage without schema migration per ML service change
- Row Level Security (RLS) enforced at database layer
- Built-in Realtime CDC via Supabase's Postgres replication

### Schema (actual from `backend/schema.sql`)

```sql
-- Users: public mirror of Supabase auth.users
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name  TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analysis_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_path    TEXT NOT NULL,        -- stores the signed URL (1h TTL)
  status        TEXT NOT NULL DEFAULT 'PROCESSING',
  error_message TEXT DEFAULT NULL,   -- populated on FAILED status
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at  TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

CREATE TABLE analysis_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  verdict        TEXT,               -- REAL | FAKE | UNCERTAIN
  confidence     FLOAT,
  fft_score      FLOAT,
  liveness_score FLOAT,
  sync_score     FLOAT,
  details        JSONB              -- full aggregator output
);
```

**Notable differences from documentation claims:**
- `analysis_jobs.video_path` stores the **signed URL** (not a storage path)
- `analysis_jobs.error_message` (not `error`)
- `analysis_jobs.completed_at` exists (not `updated_at`)
- No `original_name` column in `analysis_jobs`
- `public.users` table exists as a profile mirror (separate from `auth.users`)
- No `UNIQUE` constraint on `analysis_results.job_id` in the schema file (no `UNIQUE` keyword)

### Row Level Security

```sql
CREATE POLICY "Users can only access their own profile"
ON users FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can only access their own jobs"
ON analysis_jobs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access results for their jobs"
ON analysis_results FOR ALL USING (
  EXISTS (
    SELECT 1 FROM analysis_jobs
    WHERE analysis_jobs.id = analysis_results.job_id
    AND analysis_jobs.user_id = auth.uid()
  )
);
```

**Defense in depth:** Even if the Express layer has a broken access control bug (IDOR), the database refuses to return unauthorized data.

### JSONB vs. Separate Tables for Details

The `details` JSONB column stores the full aggregator output (including `fftResult`, `livenessResult`, and per-signal breakdowns). This allows the frontend to render all result charts without additional DB queries, and allows the ML service output schema to evolve without DB migrations.

**When to reconsider:** If analytical features are added (aggregate fake scores by time period, compare average confidence by video type), denormalizing details into structured columns becomes necessary for query performance.

### `ensureUserProfile()` pattern

The backend calls `ensureUserProfile(user)` on every video submission. This `upsert`s a row in `public.users` before creating an analysis job. This handles users who signed up via the frontend Supabase client before the `auth.users` trigger was installed in Supabase. It uses the service role key (`supabaseAdmin`) to bypass RLS on the upsert.

---

## 7. API Design

### Architecture: RESTful with Async Job Pattern

The API uses the standard async job pattern for long-running operations:
1. `POST /api/analysis/submit` → returns `202 Accepted` with `jobId` immediately
2. Client subscribes via Socket.io room (`job:{jobId}`) for immediate notification
3. `GET /api/analysis/jobs/:id` → returns full result when job is COMPLETED

### Endpoint Reference (actual routes from `backend/src/routes/`)

```
POST /api/analysis/submit
  Auth: Required (Supabase JWT)
  Body: multipart/form-data { video: File }
  Constraints:
    - Max size: 100MB (Multer limit)
    - Multer field name: "video"
  Response 202: { message: "Analysis started", jobId: "uuid" }
  Response 400: { message: "No file uploaded" }
  Response 401: { error: "Missing or invalid Authorization header" }

GET /api/analysis/jobs
  Auth: Required
  Response 200: [{ id, user_id, video_path, status, error_message, created_at, completed_at }, ...]
  (last 50 jobs, ordered by created_at DESC)

GET /api/analysis/jobs/:id/status
  Auth: Required
  Response 200: { id, status, error_message, created_at }
  Response 404 / error from DB

GET /api/analysis/jobs/:id
  Auth: Required
  Response 200: { id, status, ..., analysis_results: { verdict, confidence, fft_score,
                  liveness_score, sync_score, details } }
  (Supabase joined query: analysis_jobs with analysis_results(*))

DELETE route: Not yet implemented in the current routes
```

**Note:** The original `GET /api/results/:jobId` route described in earlier documentation is superseded by `GET /api/analysis/jobs/:id`, which returns the job with nested result.

### Authentication

All protected endpoints use Bearer JWT authentication via `requireAuth` middleware → `supabase.auth.getUser(token)`. The JWT contains the user's UUID which is used for all database writes.

### Rate Limiting

**Current state: Not implemented.** This is a significant production gap. Without rate limiting, a single user can submit many concurrent video analysis jobs, exhausting GPU resources on all three ML services.

### Input Validation

Multer `memoryStorage` with a 100MB file size limit. Joi validation is available as a dependency but the submit endpoint currently relies primarily on Multer's built-in limits.

---

## 8. Frontend Design Decisions

### UI Architecture: Single Page Application (SPA) with Client-Side Routing

React Router v6 with `BrowserRouter`. **Five active routes** (actual routes from `App.jsx`):
- `/` — Public landing page (`Home.jsx`)
- `/auth` — Supabase Auth UI component (`Auth.jsx`)
- `/analyze` — Protected, video submission and real-time analysis (`Analyze.jsx`)
- `/library` — Protected, job history (`Library.jsx`)
- `/result/:jobId` — Protected, forensic analysis result (`Result.jsx`)

**Legacy redirects (in App.jsx):**
- `/upload` → `/analyze`
- `/dashboard` → `/library`

`ProtectedRoute` component wraps authenticated routes — checks Supabase session via `AuthContext`, redirects to `/auth` if unauthenticated.

**Other pages present:** `Dashboard.jsx`, `ForensicDashboard.jsx`, `Upload.jsx` exist in the `pages/` directory as earlier iterations; they are not active routes.

### Styling

The frontend uses **TailwindCSS v3** (devDependency `tailwindcss: ^3.4.3`) with PostCSS. A `tailwind.config.js` and `postcss.config.js` are present. This is NOT vanilla CSS — earlier documentation claiming "Vanilla CSS" is incorrect.

Additional UI libraries:
- **Framer Motion** (`^11.1.7`) — animations
- **lucide-react** (`^1.8.0`) — icons
- **Recharts** (`^2.12.4`) — result charts
- **clsx** (`^2.1.1`) — conditional class merging
- **date-fns** (`^4.1.0`) — date formatting

### Context Providers

- **`ThemeProvider`** (`context/ThemeContext`) — dark/light theme toggle (visible via `ThemeToggle.jsx` component in Navbar)
- **`AuthProvider`** (`context/AuthContext`) — Supabase auth state via `onAuthStateChange`

### Component Hierarchy

```
App
├── ThemeProvider
│   └── AuthProvider
│       └── BrowserRouter
│           ├── Navbar (with ThemeToggle)
│           └── Routes
│               ├── / → Home
│               ├── /auth → Auth
│               ├── /analyze → ProtectedRoute → Analyze
│               ├── /library → ProtectedRoute → Library
│               └── /result/:jobId → ProtectedRoute → Result
```

Component subdirectories under `src/components/`:
- `common/` — Alert, Badge, Loader, Navbar, ProtectedRoute, ThemeToggle
- `dashboard/` — Dashboard-specific components
- `results/` — Result page components
- `upload/` — Upload-related components

### State Management

No global state library (Redux/Zustand). State is distributed:
- **Auth state:** Supabase `onAuthStateChange` in `AuthContext`
- **Job list:** Local state in Library page
- **Real-time job status:** Socket.io subscription in Analyze page
- **Analysis result:** Local state in Result page, fetched from `GET /api/analysis/jobs/:id`

**Why no Redux?** The application data flow is linear — there is no shared mutable state across sibling components that requires a centralized store.

### Rendering Strategy

Client-side rendering (CSR) via Vite. No SSR. Acceptable because:
- All pages are behind authentication (no SEO requirement for protected pages)
- Data is user-specific (no benefit to server-rendered HTML)
- Vite delivers excellent development DX and production bundle optimization

---

## 9. Backend Design Decisions

### Microservices vs. Monolith

MAVEN chose a **partial microservices architecture**: a Node.js orchestrator backed by three Python ML microservices. This separation provides:

1. **Language isolation:** Python ML dependencies (PyTorch, MediaPipe, HuggingFace Transformers) are completely isolated from the Node.js runtime.
2. **Independent scaling:** The LipSync SyncNet service is the most compute-intensive. In production, it can be scaled to GPU instances while FFT runs on CPU instances.
3. **Fault isolation:** A crash in the liveness service doesn't take down the frontend or the orchestrator.

**What MAVEN is NOT doing (and should eventually):**
- No circuit breaker — a dead ML service causes all jobs to fail
- No retry logic on ML service calls
- No independent CI/CD per service (single monorepo)

### Business Logic Organization

```
routes/      → parameter extraction + validation → controllers/
controllers/ → business orchestration (upload, create job, trigger analysis)
services/    → external integrations (supabase.service.js, mlOrchestrator.js, aggregator.js, analysis.service.js, auth.service.js)
middleware/  → cross-cutting concerns (auth, upload, errors)
utils/       → pure utilities (logger via Winston)
socket.js    → Socket.io singleton (getIO())
```

This is a standard layered architecture. Controllers are thin orchestrators; services encapsulate external dependencies.

### Event-Driven vs. Queue-Based Architecture

**Current design:** Synchronous HTTP fan-out with `Promise.all` + fire-and-forget `.catch()`. The analysis runs as a background async operation without blocking the HTTP response.

**The problem with this:** If the Node.js process crashes mid-analysis, the job stays in `PROCESSING` forever. There is no recovery mechanism.

**Better design (not yet implemented):** A job queue (BullMQ + Redis) would persist the job task durably. On orchestrator restart, the worker picks up incomplete jobs. This is the correct production architecture.

### Socket.io vs. Supabase Realtime

MAVEN implements **both**:
- **Socket.io** (primary): Fires immediately from Node.js when `saveAnalysisResult()` completes. Room-based (`job:{jobId}`) so only the submitting user gets the notification.
- **Supabase Realtime** (secondary/confirmation): Postgres CDC propagates the UPDATE on `analysis_jobs`. Arrives ~100–500ms after Socket.io. Serves as a reliable fallback if the Socket.io connection drops.

For UX purposes, Socket.io fires first; Supabase Realtime serves as confirmation.

---

## 10. Security Analysis

### Threat Model

**Assets:** User video files (potentially sensitive — face data, personal recordings), analysis results, user authentication credentials.

**Threat Actors:**
- External attacker attempting to access other users' videos/results
- Malicious video uploads designed to exploit ML inference pipeline
- Denial-of-service via large file uploads or high-volume submission

### Authentication Design

Supabase JWT-based authentication. JWTs are:
- Validated on every request via `supabase.auth.getUser()` in `requireAuth` middleware
- Short-lived with automatic refresh via Supabase client

**Gap:** The Python ML services do not validate the JWT or any caller identity. Any process that can reach `fft-service:8001` on the Docker network can submit arbitrary video URLs. Mitigated currently by Docker network isolation (ML services are not exposed to the public internet), but a compromised Node.js container could abuse this trust.

**Fix:** Add an internal service token (`X-Internal-Token: <shared_secret>`) validated by each Python service.

### Authorization Model

Row Level Security (RLS) at PostgreSQL level enforces that:
- Users can only access `analysis_jobs` WHERE `user_id = auth.uid()`
- Users can only access `analysis_results` WHERE the linked job belongs to them
- Users can only access their own `users` profile row

This is defense-in-depth — even if the Express layer has a broken access control bug (IDOR), the database refuses to return unauthorized data.

### Data Protection

- Videos stored in a **private** Supabase Storage bucket (`maven-videos`) — not publicly accessible
- **Signed URLs** (1-hour TTL) generated for ML service access, stored in `analysis_jobs.video_path`
- Video files are never persisted to Node.js server disk — Multer uses `memoryStorage()`
- Python services delete temp files unconditionally in `finally` blocks

### Input Validation

- File size limit: 100MB (Multer `limits.fileSize`)
- `video_url` passed to Python services is the Supabase signed URL — Python services download it via HTTP, not as a local file path (liveness and lipsync services)
- **Note:** The FFT service receives `video_path` which can be a URL or local path. URL detection is handled by `video_path.startswith("http://") or video_path.startswith("https://")`.

### Missing Security Controls (Production Gaps)

1. No rate limiting on `/api/analysis/submit`
2. No HTTPS enforcement in current config (Nginx handles in production)
3. No CSP (Content Security Policy) headers
4. No internal service authentication between Node.js and Python services
5. CORS currently set to `allow_origins=["*"]` in FastAPI services

---

## 11. Performance Engineering

### Bottlenecks

1. **ViT Inference (~300ms/frame on CPU):** The dima806 ViT classifier runs on 15 frames by default (max_frames=15 from orchestrator), making this ~4.5s per video on CPU.

2. **DFDC EfficientNet B7 NS (~150ms/frame on CPU):** 20 frames × TTA (2×) = 40 inference passes. ~6s on CPU.

3. **MediaPipe FaceLandmarker (Liveness Service):** Processes every frame of the video. For a 30s clip at 25fps = 750 frames. ~3–5s total.

4. **Wav2Lip SyncNet (LipSync Service):** Sliding window over all non-silent frames. Dense stride (stride=1) means nearly every frame gets a window. Mel spectrogram computation + SyncNet forward pass per window. ~10–20s on CPU.

5. **Video Download ×3:** Each Python service independently downloads the video from the signed URL. For a 100MB video, that's 300MB total egress per analysis, and 3 separate download round-trips adding ~3–15s of latency.

6. **Node.js memory usage for large uploads:** Multer `memoryStorage` keeps the entire video in RAM during upload. A 100MB upload = 100MB heap allocation.

### Caching Strategy

**Current:** No caching. ML model weights are pre-loaded at FastAPI lifespan startup (cached in process memory), which is correct.

**Recommended:**
- Redis cache for analysis results by video SHA-256 hash
- Shared Docker volume for video file (download once, all services read)

### Latency Budget (30s video estimate)

| Stage | CPU Estimate |
|---|---|
| Upload to Supabase Storage | 3–8s (network) |
| Job creation + signed URL | ~200ms |
| Parallel ML services (longest: LipSync) | ~15–25s |
| Score aggregation | ~5ms |
| DB write | ~100ms |
| Socket.io push to frontend | ~10ms |
| Supabase Realtime CDC | ~100–500ms |
| **Total end-to-end** | **~20–35s** |

---

## 12. Scalability Analysis

### Current Scale

Expected for a portfolio/demo project:
- ~10–50 registered users
- ~5–20 concurrent analysis jobs
- ~100 videos total

This load is trivially handled by a single node.

### 10× Scale (~500 users, 50 concurrent jobs)

**Bottleneck:** Single instance LipSync service. At 50 concurrent jobs, each taking 20s of CPU compute, a single CPU instance handles ~3 concurrent jobs. Queue depth grows unboundedly.

**Solution:**
- Replace direct HTTP fan-out with a job queue (BullMQ + Redis)
- Scale LipSync service to multiple GPU instances as consumers
- FFT and Liveness are CPU-bound and scale on commodity instances

**Database:** Single Supabase PostgreSQL instance handles 500 users trivially.

### 100× Scale (~5,000 users, 500 concurrent jobs)

**Architecture changes required:**
1. **Job queue:** BullMQ or Kafka for durable job persistence and worker scaling
2. **Video storage:** Supabase Storage → AWS S3 with CDN for multi-region low-latency downloads to GPU instances
3. **ML services:** Kubernetes deployment with HPA based on queue depth
4. **Database:** Read replicas for dashboard queries; primary for writes
5. **Node.js backend:** Multiple instances behind load balancer; Socket.io with Redis Pub/Sub adapter for multi-instance WebSocket support
6. **Cost consideration:** GPU inference at this scale → pricing model required

---

## 13. Development Workflow

### Project Structure (Monorepo)

```
Maven/
├── frontend/              (React 18 / Vite SPA + TailwindCSS)
│   └── src/
│       ├── pages/         (Home, Auth, Analyze, Library, Result)
│       ├── components/    (common/, dashboard/, results/, upload/)
│       ├── context/       (AuthContext, ThemeContext)
│       ├── hooks/
│       ├── lib/
│       └── services/
├── backend/               (Node.js / Express 5 orchestrator)
│   └── src/
│       ├── controllers/   (analysis.controller.js, results.controller.js, auth.controller.js)
│       ├── middleware/    (auth.middleware.js, upload.middleware.js, error.middleware.js)
│       ├── routes/        (analysis.routes.js, results.routes.js, auth.routes.js)
│       ├── services/      (mlOrchestrator.js, aggregator.js, analysis.service.js, ...)
│       └── utils/         (logger — Winston)
├── ml-services/
│   ├── fft_service/       (FastAPI + ViT + DFDC EfficientNet + spectral + temporal)
│   │   ├── analyzer.py
│   │   ├── selimsef_predictor.py
│   │   ├── spectral_analyzer.py
│   │   ├── color_consistency.py
│   │   ├── temporal_analyzer.py
│   │   ├── bootstrap_cnn_weights.py
│   │   └── models/cnn_classifier.py
│   ├── liveness_service/  (FastAPI + CHROM rPPG + EAR blink)
│   │   ├── rppg.py
│   │   ├── blink_detector.py
│   │   └── face_landmarker.py
│   └── lipsync_service/   (FastAPI + Wav2Lip SyncNet)
│       ├── cross_modal_transformer.py  (contains SyncNet_color + analyze_lipsync)
│       ├── audio_processor.py
│       └── lip_tracker.py
├── docker/                (Dockerfiles per service — planned)
├── docker-compose.yml     (currently empty)
└── nginx.conf
```

### Build Process

```bash
# Frontend standalone
cd frontend && npm run dev   # Vite dev server on :5173

# Backend standalone
cd backend && npm run dev    # node --watch server.js on :4000

# Individual Python service (dev)
cd ml-services/fft_service
.venv/bin/uvicorn main:app --reload --port 8001

cd ml-services/liveness_service
.venv/bin/uvicorn main:app --reload --port 8002

cd ml-services/lipsync_service
.venv/bin/uvicorn main:app --reload --port 8003
```

### Dependency Management

- **Frontend:** npm with `package-lock.json`; TailwindCSS v3, React 18, Recharts, Framer Motion, socket.io-client
- **Backend:** npm with `package-lock.json`; Express 5, Supabase JS v2, Multer v2, Socket.io v4, Winston, Joi
- **Python (FFT):** `requirements.txt` with pinned versions; PyTorch 2.4, transformers, timm, OpenCV, NumPy 1.26.4
- **Python (Liveness):** `requirements.txt` with pinned versions; mediapipe==0.10.33, PyTorch 2.2, librosa, OpenCV, NumPy 1.26.4
- **Python (LipSync):** `requirements.txt` with pinned versions; mediapipe==0.10.33, PyTorch 2.2, torchaudio 2.2, librosa, scikit-image, OpenCV, NumPy 1.26.4

**Critical pin:** `numpy==1.26.4` across all Python services. NumPy 2.x breaks PyTorch and MediaPipe ABI compatibility. Python 3.12 required; 3.13+ lacks wheels for mediapipe and pydantic-core.

---

## 14. Tradeoff Analysis

### Decision 1: Microservices vs. Monolith

**Option A (chosen): Polyglot Microservices (Node.js + 3× Python)**

Pros:
- Language-appropriate separation: Python for ML, Node.js for I/O orchestration
- Dependency isolation (NumPy ABI issue isolated to Python containers)
- Independent horizontal scaling of each detection layer
- Each service has a single clear responsibility

Cons:
- Network latency on every ML call (HTTP overhead vs. in-process function call)
- Operational complexity: 6 processes to manage, health check, and monitor
- No shared memory: video must be re-downloaded by each service independently
- Service discovery complexity (Docker network DNS)

**Why chosen:** The NumPy/MediaPipe/PyTorch ABI incompatibility alone justifies isolation. Beyond that, language-appropriate tooling (Express middleware ecosystem for auth/upload vs. Python ML stack) produces cleaner code at each layer.

---

### Decision 2: Supabase Realtime + Socket.io vs. Polling

**Option A (chosen): Dual push (Socket.io primary + Supabase Realtime secondary)**

Pros:
- Socket.io fires immediately from the Node.js process with ~10ms latency
- Supabase Realtime provides a reliable fallback if Socket.io connection drops
- No polling overhead — frontend is notified exactly when job status changes

Cons:
- Two push mechanisms to maintain and debug
- WebSocket connection must stay open during analysis (20–35s)
- Supabase Realtime is an external dependency (outage affects notification delivery)

**Why chosen:** Real-time UX is a differentiating feature for a forensics tool. Socket.io provides the lowest-latency notification from the orchestrator; Supabase Realtime provides persistence-backed confirmation.

---

### Decision 3: Dynamic Confidence-Weighted Aggregation vs. Fixed Weights

**Option A (chosen): Dynamic weights with model agreement scoring**

Pros:
- Weights adapt to data availability (no speech → lipsync gets 0% not 35%)
- High-confidence signals count more than borderline ones
- Model agreement scoring provides additional signal beyond weighted average
- Transparent and fully auditable

Cons:
- More complex — harder to reason about individual edge cases
- Thresholds are still hand-tuned, not statistically calibrated

**Option B (not chosen): Simple fixed weights**
- `{ fft: 0.30, liveness: 0.40, lipsync: 0.30 }` as a static average

**Why A was selected:** The dynamic approach correctly handles the common case of a video with no speech (YouTube clips, B-roll footage) where a fixed 30% lipsync weight would dilute genuine fake signals from FFT and liveness with a neutral 0.5 lipsync score.

---

### Decision 4: DFDC EfficientNet as Anchor vs. ViT as Anchor

**Option A (chosen): DFDC EfficientNet as primary anchor**

The DFDC EfficientNet B7 NS produces near-zero outputs (0.005–0.02) on real video regardless of compression level. This makes it an extremely reliable "REAL" signal. The ViT model produces 50–56% fake probability on real mobile-compressed video (H.265/HEVC), creating systematic false positives.

**The disagreement handling:** When models disagree:
- DFDC=REAL + ViT=FAKE → trust DFDC (ViT has compression bias)
- DFDC=FAKE + ViT=REAL → trust DFDC (rare, suspicious)
- DFDC≈0 + ViT=FAKE → elevate ViT (DFDC is out-of-domain for this content type)

The out-of-domain path is critical for modern diffusion-based generators (Sora, Kling, Veo) which the DFDC model has never seen.

---

### Decision 5: Multer memoryStorage vs. diskStorage

**Option A (chosen): Multer memoryStorage**

Pros:
- No disk I/O on the Node.js server
- Video bytes available immediately in memory for streaming to Supabase Storage
- No temp file cleanup required

Cons:
- 100MB upload = 100MB heap allocation per concurrent upload
- At 10 concurrent 100MB uploads = 1GB heap — memory exhaustion risk

**Why chosen:** For demo scale (<5 concurrent uploads), memory is not a concern. The cleaner code path (no temp file management) is worth the tradeoff.

---

## 15. Interview Questions & Model Answers

### Beginner Questions

**Q: What is a deepfake and how does your system detect it?**

A: A deepfake is a video where AI has been used to synthesize or replace a person's face or voice. MAVEN detects deepfakes through three signals that AI-generated content fails to replicate realistically: (1) visual artifacts — GAN and diffusion models leave distinctive patterns in the pixel spectrum and have difficulty matching real face texture, color consistency, and temporal coherence; (2) physiological absence — fake faces don't have a real heartbeat pulsing through their skin pixels; and (3) audio-visual desynchronization — when audio is dubbed or swapped, lip movements don't precisely match the phonemes being spoken.

**Q: Why did you use three detection methods instead of one?**

A: No single detection method is robust across all deepfake generation techniques. A GAN-generated face swap may have perfect lip sync but spectral artifacts. An audio dubbing attack has clean video but fails liveness and sync checks. A diffusion-generated face may fool spectral analysis but fail temporal coherence checks. By requiring an adversary to defeat all three independent detection vectors simultaneously, MAVEN is significantly harder to evade than any single-modality detector.

**Q: What is rPPG?**

A: Remote PhotoPlethysmoGraphy — a technique to estimate blood pulse rate from video by analyzing subtle color variations in skin. Blood circulation causes tiny periodic changes in the RGB values of forehead and cheek pixels, on the order of 0.1–0.5% variation per heartbeat. Real human faces show this variation at 0.75–3.0 Hz (45–180 BPM). AI-generated faces render static skin texture without this physiological signal. MAVEN uses the CHROM algorithm across three independent skin regions (forehead, left cheek, right cheek) and cross-correlates the signals — real heartbeats appear in all regions simultaneously while deepfake noise is uncorrelated.

---

### Intermediate Questions

**Q: Why does your orchestrator use `Promise.all()` for calling the three ML services?**

A: The three ML services are independent — there is no data dependency between FFT analysis, liveness detection, and lip sync analysis. Running them sequentially would triple latency (~15s + ~10s + ~20s = ~45s). `Promise.all()` fires all three HTTP requests simultaneously and waits for all to resolve, reducing total latency to the duration of the slowest single service (~20s). This is the correct pattern for parallelizable I/O fan-out in Node.js.

**Q: Why did you use FastAPI instead of Flask for the Python services?**

A: FastAPI provides three advantages over Flask for this use case: (1) ASGI-native async support via Uvicorn, which is important for handling concurrent requests during load testing, (2) automatic request validation via Pydantic models — the `video_url` input is validated before it reaches the ML pipeline, and (3) automatic Swagger documentation at `/docs`, which I used during development to test ML service endpoints directly without needing a frontend.

**Q: Explain why you use the DFDC EfficientNet as the "anchor" model rather than the ViT.**

A: The DFDC EfficientNet B7 NS was trained specifically on the Deepfake Detection Challenge dataset, which contains real manipulated face-swap videos. It has learned to detect the actual statistical fingerprints of face-swapping, not image quality artifacts. As a result, it produces near-zero scores (0.005–0.02) on any real video regardless of compression, while producing elevated scores (0.10–0.90) on genuine deepfakes. The dima806 ViT model, by contrast, is a general image classifier that scores 50–56% fake probability on perfectly real mobile-compressed (H.265) video due to compression artifacts that superficially resemble AI smoothing. Using ViT as the anchor would result in systematic false positives on any compressed real video.

**Q: Explain the Eye Aspect Ratio formula and why it detects blinks.**

A: `EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)`. The 6 landmark points form the eye boundary: p1 (left corner), p4 (right corner), p2/p3 (upper lid), p5/p6 (lower lid). When the eye is open, the vertical distances (p2-p6, p3-p5) are large and the horizontal distance (p1-p4) is stable. When blinking, the vertical distances collapse to near zero, dropping EAR below ~0.20. A deepfake face typically shows EAR > 0.20 continuously because early generators didn't model blink dynamics. MAVEN's blink detector goes beyond simple blink counting — it scores 4 sub-metrics: rate regularity, inter-blink interval consistency, duration, and waveform smoothness.

---

### Advanced Questions

**Q: What are the failure modes of rPPG-based liveness detection and how would you mitigate them?**

A: Four primary failure modes:
1. **Glasses/occlusion:** Lens reflections distort forehead ROI pixel values. Mitigation: use additional ROIs (cheeks, chin) and drop ROIs with high reflection artifact scores. MAVEN already uses 3 regions.
2. **Motion artifacts:** Head movement during extraction corrupts the rPPG signal. Mitigation: apply motion-corrected rPPG algorithms (OMIT, iGAN) or filter frames with excessive landmark displacement between consecutive frames.
3. **Compression artifacts:** Heavily compressed video (H.264 at low bitrate) introduces DCT block artifacts that corrupt the subtle ~0.1% color variations of pulse. Mitigation: apply quality threshold check on input video bitrate before attempting rPPG analysis.
4. **Adversarial deepfakes trained with rPPG loss:** Future generators could include rPPG consistency as a training objective. Defense requires increasingly sophisticated physiological signal validation — pulse wave morphology, not just dominant frequency. MAVEN's cross-correlation and harmonic verification add robustness against simple frequency spoofing.

**Q: Your system stores the signed URL in `analysis_jobs.video_path`. What security consideration does this introduce?**

A: The signed URL in `analysis_jobs.video_path` has a 1-hour TTL. If a user fetches an old job's details after 1 hour, the video_path field will be an expired URL. The ML services can no longer re-download the video if needed. For MAVEN's current use case (results are displayed immediately after analysis), this TTL is adequate. For a production system where users might want to re-run analysis on older submissions, the backend should either (1) generate a fresh signed URL on demand when serving the job details, rather than storing the URL itself, or (2) store the raw storage path and generate URLs at query time.

**Q: How would you train the SyncNet discriminator for improved deepfake detection?**

A: The Wav2Lip pre-trained `lipsync_expert.pth` checkpoint was trained for the lip-sync generation task (maximizing sync), not for deepfake discrimination. To fine-tune it for detection: (1) collect positive pairs (lip_crops, aligned_audio) from real talking-head videos and negative pairs (lip_crops, misaligned_audio) from deepfake datasets like FakeAVCeleb or LAV-DF; (2) use a contrastive loss — maximize cosine similarity for synchronized pairs, minimize for asynchronous pairs; (3) add hard negatives: audio offset by ±200ms (subtle desync that real dubbers sometimes miss); (4) fine-tune on DeepFakeTIMIT for explicit phoneme-level violation examples. The current implementation uses the generation-task weights as a proxy discriminator, which works reasonably well but would benefit from explicit detection fine-tuning.

---

### System Design Questions

**Q: How would you redesign MAVEN to handle 10,000 concurrent video analysis jobs?**

A: Several architectural changes:

1. **Replace synchronous HTTP fan-out with a durable job queue (BullMQ + Redis or Apache Kafka)**. The orchestrator enqueues a job; worker processes consume from the queue. This handles back-pressure automatically and ensures jobs survive process crashes.

2. **Horizontal scaling of ML services via Kubernetes**. Each Python service becomes a Deployment with HPA based on queue depth metric. LipSync scales to N GPU nodes; FFT scales to M CPU nodes independently.

3. **Shared video cache**. Download video once to a shared network volume (NFS or S3-backed FUSE mount); all three workers read from the same cached file instead of downloading independently.

4. **Model serving optimization**: Export PyTorch models to ONNX and serve via Triton Inference Server, which provides batching, GPU memory management, and concurrent model execution.

5. **Async everything**: The HTTP API becomes purely a submission endpoint. Frontend uses long-lived WebSocket (or Server-Sent Events) for status. Socket.io backend scales with Redis adapter.

6. **Cost control**: Tiered inference — run FFT (cheap, CPU, ~5s) first; only run LipSync (expensive, GPU, ~5s) if FFT score exceeds a threshold. This cuts inference cost by ~40% for clearly-real videos.

---

### Architecture Questions

**Q: Why is liveness weighted lower (0.15) than FFT (0.35–0.70) in the current aggregator?**

A: The aggregator's liveness weight ranges from 0.15 to 0.30 depending on temporal data availability and lipsync data quality. This may seem counterintuitive given that rPPG is described as a "hard to fake" signal. However, there are two practical reasons for the moderate weight: (1) **data quality dependency** — the rPPG signal requires 100+ frames (~4 seconds) of a mostly forward-facing face with adequate lighting; many short or poorly-lit videos yield `signal_quality=0.1` with `pulse_present=False`, making liveness effectively uninformative; (2) **DFDC reliability** — the EfficientNet B7 NS is the primary anchor because it has been rigorously validated on DFDC competition data. The aggregator is designed so that when liveness HAS high-quality data (strong cross-correlation + harmonic), the score floors and boosts in `main.py` compensate by clamping liveness_score ≥ 0.65 or 0.70.

**Q: What is the consistency guarantee between `analysis_jobs` and `analysis_results` in your database?**

A: Currently weak — there is no transaction wrapping the two writes (`UPDATE analysis_jobs SET status=COMPLETED` and `INSERT INTO analysis_results`). If the process crashes between these two statements, a job could show COMPLETED with no corresponding result row. The frontend would then fail to find a result for a COMPLETED job. The fix: wrap both writes in a Supabase RPC function (PostgreSQL stored procedure) that executes both statements in a single transaction with ACID guarantees. Alternatively, always set status to COMPLETED only after the result row is successfully inserted.

---

## 16. Future Improvements

Ranked by impact:

### 1. Durable Job Queue (BullMQ + Redis) — HIGH IMPACT
Replace synchronous HTTP fan-out with a persistent queue. Jobs survive orchestrator crashes. Enables retry logic, dead-letter queues for failed jobs, and fair scheduling across users.

### 2. GPU Inference + Model Optimization — HIGH IMPACT
Current inference on CPU is slow. GPU (NVIDIA T4) would reduce total analysis time to ~5–10s. Additionally: export DFDC and SyncNet models to ONNX for TensorRT optimization; apply INT8 quantization (2–4× throughput improvement).

### 3. Rate Limiting + Auth on ML Services — HIGH IMPACT (SECURITY)
Add `express-rate-limit` on the submission endpoint. Add internal service token to ML service requests. Without these, the system is vulnerable to resource exhaustion.

### 4. Store Storage Path Instead of Signed URL — MEDIUM IMPACT (CORRECTNESS)
Currently `analysis_jobs.video_path` stores a 1-hour-TTL signed URL. Store the raw storage path instead, and generate fresh signed URLs on demand. This allows re-analysis of older videos and avoids expired URL issues.

### 5. Partial Result Handling — MEDIUM IMPACT
Currently, if any of the 3 ML services fails, the entire job fails. Better behavior: return partial results with reduced confidence and a flag indicating which layers are missing.

### 6. Per-Frame Explainability Heatmap — MEDIUM IMPACT
Generate GradCAM visualizations on the DFDC EfficientNet and SyncNet to produce per-frame heatmaps showing which regions contributed to the fake classification.

### 7. SyncNet Fine-Tuning on Deepfake Data — MEDIUM IMPACT (ACCURACY)
The `lipsync_expert.pth` weights were trained for generation (maximizing sync), not for discrimination. Fine-tuning on FakeAVCeleb or LAV-DF deepfake datasets with a contrastive detection objective would meaningfully improve OUT_OF_SYNC detection accuracy.

### 8. Video Hash Deduplication — MEDIUM IMPACT
Before running ML analysis, compute SHA-256 of the uploaded video. Return cached result for identical videos — eliminates redundant GPU inference for identical viral fake videos submitted multiple times.

### 9. Transaction on Dual DB Write — LOW IMPACT (CORRECTNESS)
Wrap `saveAnalysisResult()` in a stored procedure to guarantee atomic job+result write.

### 10. CI/CD Pipeline — LOW IMPACT (BUT IMPORTANT FOR CREDIBILITY)
GitHub Actions workflows: ESLint + tests on PR for backend; pytest on PR for Python services; Docker build test; Playwright E2E on staging.

---

## 17. Critical Review

Acting as a Senior Principal Engineer reviewing this project:

### Correct Decisions

**1. DFDC EfficientNet as anchor model.**
Using the DFDC competition winner (trained on real deepfake data) as the anchor signal rather than a generic image classifier is a sound engineering decision. The near-zero false positive rate on real video, regardless of compression, makes it far more reliable than a general-purpose ViT model.

**2. Multi-region rPPG with cross-correlation.**
Extracting rPPG from three independent skin regions (forehead, left/right cheeks) and requiring cross-correlation between them significantly improves robustness over single-region approaches. This is a genuine improvement over basic CHROM implementations.

**3. Dynamic aggregator with confidence weighting.**
Automatically dropping lipsync weight to 0% when no speech is detected, and scaling model weights by confidence distance from neutral, prevents the common failure mode of neutral scores diluting genuine fake signals.

**4. Wav2Lip SyncNet for lip sync detection.**
Using the actual Wav2Lip pre-trained discriminator (rather than training from scratch) gives the lipsync service a real signal to work with. The sliding-window approach with percentile-based scoring and consecutive-bad-window penalty is thoughtfully designed.

### Weak Decisions

**1. No rate limiting — Critical for any public deployment.**
Without rate limiting, a single user with a script can submit many concurrent jobs, exhausting all GPU resources. This is a P0 fix before any public demo.

**2. Storing signed URL in `video_path` instead of storage path.**
The 1-hour TTL signed URL in `analysis_jobs.video_path` will expire. This is a functional correctness issue for jobs viewed more than 1 hour after submission.

**3. `Promise.all()` with AbortController but no per-service timeout.**
A single AbortController governs all three services with a 10-minute timeout. A hung LipSync service causes the entire `Promise.all` to hang for 10 minutes. Better: individual timeouts per service (60s for lipsync, 30s for FFT/liveness), falling back to partial results.

**4. No transaction on dual DB write (jobs + results).**
Race condition: job shows COMPLETED but result row doesn't exist. Frontend crashes fetching the result. Fix: stored procedure.

**5. `docker-compose.yml` is empty.**
The orchestration story described in documentation is aspirational. The Docker Compose file is empty, meaning the full system cannot be started with `docker-compose up`.

### Risky Assumptions

**1. The SyncNet weights (`lipsync_expert.pth`) must be downloaded manually.**
The service gracefully degrades (runs with random weights, marks `weights_loaded=false`), but the aggregator treats this as NO_SPEECH/INSUFFICIENT_DATA (0% weight). The lipsync signal is entirely missing from analysis until the weights are downloaded. This should be documented prominently.

**2. DFDC weights auto-download (~255 MB) on first use.**
The auto-download from GitHub releases works, but it will block the first analysis request for the duration of the download. A Docker build step should pre-download weights.

**3. Supabase Realtime scales to concurrent users.**
Supabase Realtime on the free tier has connection limits. For a demo with many simultaneous users, you may hit the concurrent WebSocket limit. The Socket.io fallback helps here.

### Hidden Bottlenecks

**1. Video re-download ×3 in Python services.**
Each Python service independently downloads the video from the signed URL. For a 100MB video, that's 300MB of total egress per analysis.

**2. ViT [CLS] embedding extraction requiring model internals.**
The ViT embedding extraction depends on the presence of `image_processor` and specific model output structure. If the HuggingFace transformers version changes, the embedding extraction path silently falls back to pipeline-only mode (no embedding, no temporal analysis). The fallback is handled gracefully but silently degrades the analysis.

**3. Signed URL expiry during long analyses.**
If a video analysis takes more than 1 hour (unlikely but possible on overloaded CPU), the signed URL will expire before the liveness or lipsync service can download it.

---

## 18. Final Architecture Evaluation

### Architecture — 8/10

**Reasoning:** The trimodal detection architecture is technically sound and well-grounded in academic literature (CHROM rPPG, Wav2Lip SyncNet, DFDC competition winner EfficientNet). The separation of concerns (Node.js orchestration + Python ML) is correct for the polyglot constraint. The dynamic aggregator with confidence weighting and model agreement scoring shows genuine systems thinking. Deductions: no durable job queue (jobs are ephemeral with respect to crashes), no circuit breaker on ML service calls, dual-write consistency gap, empty docker-compose.

### Scalability — 5/10

**Reasoning:** The current architecture supports demo-scale loads well. However, there is no horizontal scaling story for the ML services, no load balancing across multiple ML service instances, no job queue for back-pressure management, and memoryStorage creates a hard memory ceiling on concurrent uploads. The architecture is correct for 1 instance.

### Security — 6/10

**Reasoning:** Strong points: Supabase JWT auth, Row Level Security at DB layer, Multer file validation, private storage bucket with signed URLs, temp file deletion in `finally` blocks. Gaps: no rate limiting, wildcard CORS, no internal service authentication, signed URL stored in DB (TTL risk).

### Maintainability — 7/10

**Reasoning:** Code structure is clean and follows standard conventions (routes/controllers/services). The dynamic aggregator is well-documented with inline comments explaining every boost and override. Python services follow a consistent pattern (FastAPI lifespan, Pydantic schemas, temp file cleanup). Gaps: JSONB schema is implicit (frontend must know field names), no integration tests, empty docker-compose.

### Developer Experience — 8/10

**Reasoning:** Each service can run independently with standard commands. FastAPI auto-generates `/docs` for each ML service. Supabase's dashboard provides a real-time DB inspector. Vite HMR makes frontend development fast. The monorepo structure keeps all components visible together. The `node --watch` dev mode avoids needing nodemon.

### User Experience — 7/10

**Reasoning:** Socket.io push (vs. polling) delivers a responsive feel. The three-tier verdict (REAL/UNCERTAIN/FAKE) is more honest than binary detection. Score breakdown visualization provides genuine explainability. Gaps: no per-frame heatmap visualization, no progress indicator during 20–35s analysis, no error recovery UI for expired analyses.

### Performance — 6/10

**Reasoning:** `Promise.all()` parallelism is correct and meaningful. GPU path would achieve <15s analysis for a 30s video. CPU path (default) likely takes 20–35s for LipSync + FFT + liveness combined. Video re-download ×3 is an unaddressed latency multiplier. DFDC weights auto-download blocks first request.

### Innovation — 9/10

**Reasoning:** Combining multi-region rPPG physiological liveness (with cross-correlation and harmonic verification), DFDC competition-winning EfficientNet + dima806 ViT dual-model visual analysis with temporal coherence, and Wav2Lip SyncNet lip-sync detection in a single full-stack deployable system with real-time results UI is genuinely differentiated. The dynamic confidence-weighted aggregator with model agreement scoring goes beyond naive weighted averaging. The out-of-domain handling for diffusion-based generators shows awareness of the current state of the art.

---

### Overall Assessment

MAVEN is an ambitious, technically credible deepfake forensics system with a sound academic foundation and a thoughtful full-stack implementation. The core architectural decisions are defensible and interview-ready. The primary weaknesses — no durable job queue, no rate limiting, signed URL in DB instead of storage path, empty docker-compose — are standard gaps between a portfolio demo and a production system.

For a portfolio project targeting FAANG placements, this demonstrates: distributed systems thinking (microservices + async orchestration), ML engineering depth (dual-model pipeline with disagreement handling, out-of-domain detection, multi-region rPPG with cross-correlation), production infrastructure awareness (Docker, Nginx, Supabase), and security consciousness (JWT auth, RLS, private storage, temp file cleanup). These are exactly the signals a senior engineer interviewer is looking for.

**Be honest about what is trained vs. architectural:**
- **ViT classifier:** Pre-trained HuggingFace model (dima806/deepfake_vs_real_image_detection) with calibration applied
- **DFDC EfficientNet B7 NS:** Pre-trained Kaggle competition winner (selimsef) with auto-downloaded weights
- **SyncNet (lipsync):** Pre-trained Wav2Lip checkpoint (`lipsync_expert.pth`) — requires manual download
- **SpectralCNN:** Architecture exists, bootstrap weights only, **not used in active pipeline**
- **Aggregator:** Hand-tuned weights and thresholds, not statistically calibrated on a labeled validation set

---

*Document corrected via exhaustive codebase analysis of all source files, routes, service implementations, model architectures, and database schemas. Version 2.0 reflects the actual implementation as of June 2026.*
