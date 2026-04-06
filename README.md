# MAVEN — Multimodal Audio-Visual Examination Network

> **A full-stack deepfake forensics framework** integrating frequency-domain analysis, physiological liveness verification, and audio-visual cross-consistency detection to combat synthetic media threats.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Detection Layers](#5-detection-layers)
6. [Phase-by-Phase Implementation Plan](#6-phase-by-phase-implementation-plan)
7. [Database Schema (Supabase)](#7-database-schema-supabase)
8. [API Reference](#8-api-reference)
9. [ML Model Architecture](#9-ml-model-architecture)
10. [Frontend Pages & Components](#10-frontend-pages--components)
11. [Timeline & Milestones](#11-timeline--milestones)
12. [Environment Variables](#12-environment-variables)

---

## 1. Project Overview

MAVEN detects synthetic/manipulated video content through **three complementary forensic layers**:

| Layer | Technique | Targets |
|-------|-----------|---------|
| **Frequency-Domain Analysis** | FFT + spectral artifact detection | GAN/diffusion high-frequency noise fingerprints |
| **Visual Liveness Detection** | rPPG pulse estimation + blink analysis | Physiological signals absent in deepfakes |
| **Audio-Visual Cross-Consistency** | Cross-modal transformer lip-sync | Phoneme-to-lip-movement mismatches |

The system is designed for real-world deployment as a cloud API or edge inference service.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│         Upload · Dashboard · Results · Explainability           │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST / WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│               Node.js / Express Backend (JavaScript)            │
│   Auth · Job Queue · API Gateway · Result Aggregator            │
│                   Supabase SDK (DB + Storage)                   │
└───────┬──────────────────────────────────────┬──────────────────┘
        │ Internal HTTP                         │ Supabase
        ▼                                       ▼
┌───────────────────────┐             ┌─────────────────────┐
│  Python ML Services   │             │     Supabase        │
│  ┌─────────────────┐  │             │  PostgreSQL (DB)     │
│  │ FFT Service     │  │             │  Storage (Videos)   │
│  ├─────────────────┤  │             │  Auth (Users)       │
│  │ rPPG+Blink Svc  │  │             │  Realtime           │
│  ├─────────────────┤  │             └─────────────────────┘
│  │ LipSync Svc     │  │
│  └─────────────────┘  │
└───────────────────────┘
```

**Data Flow:**
1. User uploads video via React → Node.js API
2. Node.js stores video in **Supabase Storage**, creates job record in **Supabase DB**
3. Node.js dispatches job to **Python ML microservices** (3 parallel calls)
4. Each Python service returns scores + metadata → Node.js aggregates
5. Final verdict stored in Supabase → pushed to React via **Supabase Realtime**

---

## 3. Tech Stack

### Frontend
| Tool | Purpose |
|------|---------|
| **React 18** | UI framework |
| **React Router v6** | Client-side routing |
| **Axios** | HTTP client |
| **Supabase JS Client** | Auth + Realtime subscriptions |
| **Recharts** | Score visualization charts |
| **Framer Motion** | Animations |
| **Tailwind CSS** | Styling |

### Backend (JavaScript)
| Tool | Purpose |
|------|---------|
| **Node.js 20 LTS** | Runtime |
| **Express.js** | REST API framework |
| **Supabase JS SDK** | DB + Storage + Auth validation |
| **Multer** | Multipart video upload handling |
| **Axios** | Call Python microservices |
| **Socket.io** | Real-time progress updates |
| **dotenv** | Environment config |
| **Joi** | Request validation |
| **Winston** | Logging |

### Python ML Services
| Tool | Purpose |
|------|---------|
| **FastAPI** | Microservice framework |
| **PyTorch 2.x** | Model inference |
| **OpenCV** | Frame extraction |
| **MediaPipe** | Face mesh, landmark detection |
| **Librosa / torchaudio** | Audio processing |
| **NumPy / SciPy** | FFT + signal processing |
| **Hugging Face Transformers** | Cross-modal transformer |
| **Uvicorn** | ASGI server |

### Infrastructure
| Tool | Purpose |
|------|---------|
| **Supabase** | PostgreSQL DB + Auth + Storage + Realtime |
| **Docker + docker-compose** | Service orchestration |
| **Nginx** | Reverse proxy |

---

## 4. Project Structure

```
maven/
│
├── frontend/                          # React Application
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/               # Button, Modal, Loader, etc.
│   │   │   ├── upload/               # VideoUploader, DropZone
│   │   │   ├── dashboard/            # JobList, StatusBadge
│   │   │   ├── results/              # VerdictCard, ScoreChart
│   │   │   └── explainability/       # HeatmapViewer, SyncTimeline
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Upload.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Result.jsx
│   │   │   └── Auth.jsx
│   │   ├── hooks/
│   │   │   ├── useAnalysis.js
│   │   │   └── useRealtime.js
│   │   ├── services/
│   │   │   └── api.js                # Axios API wrapper
│   │   ├── lib/
│   │   │   └── supabaseClient.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env
│   ├── package.json
│   └── vite.config.js
│
├── backend/                           # Node.js / Express API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── analysis.routes.js
│   │   │   └── results.routes.js
│   │   ├── controllers/
│   │   │   ├── analysis.controller.js
│   │   │   └── results.controller.js
│   │   ├── services/
│   │   │   ├── supabase.service.js   # DB + Storage operations
│   │   │   ├── mlOrchestrator.js     # Fan-out to Python services
│   │   │   └── aggregator.js         # Fuse scores → final verdict
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js    # Validate Supabase JWT
│   │   │   ├── upload.middleware.js  # Multer config
│   │   │   └── error.middleware.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   ├── config/
│   │   │   └── index.js
│   │   └── app.js
│   ├── server.js
│   ├── .env
│   └── package.json
│
├── ml-services/                       # Python ML Microservices
│   ├── fft_service/
│   │   ├── main.py                   # FastAPI app
│   │   ├── analyzer.py               # FFT + spectral artifact logic
│   │   ├── models/
│   │   │   └── cnn_classifier.py
│   │   └── requirements.txt
│   │
│   ├── liveness_service/
│   │   ├── main.py                   # FastAPI app
│   │   ├── rppg.py                   # Remote photoplethysmography
│   │   ├── blink_detector.py         # Eye blink analysis
│   │   ├── models/
│   │   │   └── liveness_model.py
│   │   └── requirements.txt
│   │
│   └── lipsync_service/
│       ├── main.py                   # FastAPI app
│       ├── cross_modal_transformer.py
│       ├── audio_processor.py
│       ├── lip_tracker.py
│       ├── models/
│       │   └── sync_transformer.py
│       └── requirements.txt
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.fft
│   ├── Dockerfile.liveness
│   └── Dockerfile.lipsync
│
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## 5. Detection Layers

### Layer 1 — Frequency-Domain Analysis (FFT)

**What it detects:** GAN/diffusion artifacts manifest as anomalous high-frequency patterns in the spectral domain — invisible to the human eye but mathematically distinguishable.

**Pipeline:**
```
Video → Extract Frames → Per-frame 2D FFT
→ Compute power spectrum → Azimuthal averaging
→ CNN classifier on frequency map
→ Artifact Score [0.0 – 1.0]
```

**Key Techniques:**
- 2D Discrete Fourier Transform (`numpy.fft.fft2`) on face-cropped frames
- Log-scaled magnitude spectrum visualization
- High-frequency ratio (HFR): energy above Nyquist/2 vs. total energy
- Pre-trained CNN fine-tuned on spectral maps (FaceForensics++ FFT signatures)
- Temporal consistency check across frame frequency maps

**Output:**
```json
{
  "artifact_score": 0.87,
  "high_freq_ratio": 0.34,
  "suspicious_frames": [12, 45, 89],
  "spectrum_heatmap_url": "..."
}
```

---

### Layer 2 — Visual Liveness Detection (rPPG + Blink)

**What it detects:** Biological signals that synthetic models fail to replicate — pulse (via skin color variation) and natural eye-blink patterns.

#### 2a. Remote Photoplethysmography (rPPG)
```
Video → Face ROI Detection (MediaPipe)
→ Extract forehead/cheek skin patches
→ Track RGB channel values across frames
→ Apply CHROM or POS algorithm → Raw rPPG signal
→ Bandpass filter (0.7–4.0 Hz, ~42–240 BPM)
→ FFT on signal → Dominant frequency = estimated HR
→ Plausibility check + signal quality score
```

**Deepfake tells:** Irregular or absent pulse waveform, non-physiological frequency peaks, poor SNR from pixel-perfect but temporally static skin.

#### 2b. Eye Blink Analysis
```
Video → Facial Landmarks (MediaPipe 468 points)
→ Compute Eye Aspect Ratio (EAR) per frame
  EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)
→ Detect blink events (EAR < 0.2 for ≥ 2 frames)
→ Extract: blink rate, duration, inter-blink interval
→ Compare to physiological norms (15–20 blinks/min)
→ Blink Regularity Score [0.0 – 1.0]
```

**Output:**
```json
{
  "liveness_score": 0.91,
  "rppg": {
    "estimated_hr_bpm": 73,
    "signal_quality": 0.82,
    "pulse_present": true
  },
  "blink": {
    "blink_rate_per_min": 4.2,
    "normal_range": [15, 20],
    "regularity_score": 0.23
  }
}
```

---

### Layer 3 — Audio-Visual Cross-Consistency (Lip-Sync)

**What it detects:** Subtle mismatches between lip movements and speech phonemes — hallmark of dubbing-based deepfakes and audio-swap attacks.

**Pipeline:**
```
Video → Extract audio (16kHz WAV) + video frames
→ Detect lip ROI per frame (MediaPipe mouth landmarks)
→ Audio: compute Mel-spectrogram + MFCCs
→ Video: extract lip-crop sequences (32 frames × 88×88)
→ Feed into cross-modal transformer:
    - Visual encoder: Conv3D → Transformer encoder
    - Audio encoder: Conv1D → Transformer encoder
    - Cross-attention: lip queries attend to audio keys/values
→ Contrastive sync score per clip window
→ Aggregate: mean sync score + flagged segments
```

**Output:**
```json
{
  "sync_score": 0.12,
  "verdict": "OUT_OF_SYNC",
  "flagged_segments": [
    { "start_sec": 3.2, "end_sec": 5.8, "score": 0.08 }
  ],
  "phoneme_alignment": "..."
}
```

---

### Score Fusion (Node.js Aggregator)

```javascript
// backend/src/services/aggregator.js

function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
  const weights = { fft: 0.30, liveness: 0.40, lipsync: 0.30 };

  // Normalize each to [0=real, 1=fake] scale
  const fftFakeScore    = fftResult.artifact_score;
  const livenessFakeScore = 1 - livenessResult.liveness_score;
  const lipsyncFakeScore  = 1 - lipsyncResult.sync_score;

  const weightedScore =
    weights.fft      * fftFakeScore +
    weights.liveness * livenessFakeScore +
    weights.lipsync  * lipsyncFakeScore;

  const verdict =
    weightedScore > 0.65 ? "FAKE" :
    weightedScore > 0.40 ? "UNCERTAIN" : "REAL";

  return {
    verdict,
    confidence: parseFloat(weightedScore.toFixed(4)),
    breakdown: { fftFakeScore, livenessFakeScore, lipsyncFakeScore }
  };
}
```

---

## 6. Phase-by-Phase Implementation Plan

---

### Phase 1 — Project Setup & Infrastructure
**Duration: Week 1**

#### 1.1 Initialize Repositories
```bash
# Root monorepo
mkdir maven && cd maven
git init

# Frontend
npm create vite@latest frontend -- --template react
cd frontend && npm install

# Backend
mkdir backend && cd backend
npm init -y
npm install express cors dotenv multer axios joi winston @supabase/supabase-js socket.io

# ML Services
mkdir -p ml-services/fft_service ml-services/liveness_service ml-services/lipsync_service
```

#### 1.2 Supabase Project Setup
1. Create new project at [supabase.com](https://supabase.com)
2. Enable **Storage** bucket: `maven-videos` (private)
3. Enable **Authentication** (Email/Password + Google OAuth)
4. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
5. Run schema migrations (see [Section 7](#7-database-schema-supabase))

#### 1.3 Docker Compose Setup
```yaml
# docker-compose.yml
version: '3.9'
services:
  backend:
    build: ./docker/Dockerfile.backend
    ports: ["4000:4000"]
    env_file: ./backend/.env

  fft-service:
    build: ./docker/Dockerfile.fft
    ports: ["8001:8001"]

  liveness-service:
    build: ./docker/Dockerfile.liveness
    ports: ["8002:8002"]

  lipsync-service:
    build: ./docker/Dockerfile.lipsync
    ports: ["8003:8003"]

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf"]
```

---

### Phase 2 — Backend API (Node.js / Express)
**Duration: Week 2–3**

#### 2.1 Express App Setup
```javascript
// backend/src/app.js
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import analysisRoutes from './routes/analysis.routes.js';
import resultsRoutes from './routes/results.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/analysis', analysisRoutes);
app.use('/api/results', resultsRoutes);
app.use(errorMiddleware);

export default httpServer;
```

#### 2.2 Auth Middleware (Supabase JWT Validation)
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

#### 2.3 Video Upload & Analysis Trigger
```javascript
// backend/src/controllers/analysis.controller.js
import { uploadVideoToSupabase } from '../services/supabase.service.js';
import { runMLAnalysis } from '../services/mlOrchestrator.js';
import { computeFinalVerdict } from '../services/aggregator.js';
import { supabase } from '../services/supabase.service.js';

export const submitVideo = async (req, res) => {
  const { file } = req;
  const userId = req.user.id;

  // 1. Upload to Supabase Storage
  const videoPath = await uploadVideoToSupabase(file, userId);

  // 2. Create job record
  const { data: job } = await supabase
    .from('analysis_jobs')
    .insert({ user_id: userId, video_path: videoPath, status: 'PROCESSING' })
    .select().single();

  res.status(202).json({ jobId: job.id, message: 'Analysis started' });

  // 3. Run ML analysis asynchronously (non-blocking)
  runMLAnalysis(videoPath, job.id).catch(console.error);
};
```

#### 2.4 ML Orchestrator — Fan-out to Python Services
```javascript
// backend/src/services/mlOrchestrator.js
import axios from 'axios';
import { supabase } from './supabase.service.js';
import { computeFinalVerdict } from './aggregator.js';
import { io } from '../app.js';

const ML_SERVICES = {
  fft:      process.env.FFT_SERVICE_URL      || 'http://fft-service:8001',
  liveness: process.env.LIVENESS_SERVICE_URL || 'http://liveness-service:8002',
  lipsync:  process.env.LIPSYNC_SERVICE_URL  || 'http://lipsync-service:8003',
};

export async function runMLAnalysis(videoPath, jobId) {
  try {
    // Fan-out: call all 3 services in parallel
    const [fftResult, livenessResult, lipsyncResult] = await Promise.all([
      axios.post(`${ML_SERVICES.fft}/analyze`,      { video_path: videoPath }).then(r => r.data),
      axios.post(`${ML_SERVICES.liveness}/analyze`, { video_path: videoPath }).then(r => r.data),
      axios.post(`${ML_SERVICES.lipsync}/analyze`,  { video_path: videoPath }).then(r => r.data),
    ]);

    // Fuse scores
    const verdict = computeFinalVerdict({ fftResult, livenessResult, lipsyncResult });

    // Save to Supabase
    await supabase.from('analysis_results').insert({
      job_id: jobId,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      fft_score: fftResult.artifact_score,
      liveness_score: livenessResult.liveness_score,
      sync_score: lipsyncResult.sync_score,
      details: { fftResult, livenessResult, lipsyncResult }
    });

    await supabase.from('analysis_jobs')
      .update({ status: 'COMPLETED' })
      .eq('id', jobId);

    // Notify frontend via Socket.io
    io.to(`job:${jobId}`).emit('analysis_complete', { jobId, verdict });

  } catch (err) {
    await supabase.from('analysis_jobs')
      .update({ status: 'FAILED', error: err.message })
      .eq('id', jobId);
    io.to(`job:${jobId}`).emit('analysis_failed', { jobId, error: err.message });
  }
}
```

---

### Phase 3 — Python ML Microservices
**Duration: Week 3–7**

#### 3.1 FFT Service (`ml-services/fft_service/`)

```python
# ml-services/fft_service/main.py
from fastapi import FastAPI
from pydantic import BaseModel
from analyzer import run_fft_analysis

app = FastAPI(title="MAVEN FFT Service")

class AnalysisRequest(BaseModel):
    video_path: str

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    result = run_fft_analysis(req.video_path)
    return result
```

```python
# ml-services/fft_service/analyzer.py
import cv2, numpy as np
from pathlib import Path

def run_fft_analysis(video_path: str) -> dict:
    cap = cv2.VideoCapture(video_path)
    artifact_scores = []
    suspicious_frames = []
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # 2D FFT
        f = np.fft.fft2(gray)
        fshift = np.fft.fftshift(f)
        magnitude = np.log1p(np.abs(fshift))

        # High-frequency energy ratio
        h, w = magnitude.shape
        center_mask = np.zeros((h, w)); center_mask[h//4:3*h//4, w//4:3*w//4] = 1
        low_energy  = np.sum(magnitude * center_mask)
        total_energy = np.sum(magnitude)
        hfr = 1 - (low_energy / (total_energy + 1e-8))

        artifact_scores.append(float(hfr))
        if hfr > 0.55: suspicious_frames.append(frame_idx)
        frame_idx += 1

    cap.release()

    mean_score = float(np.mean(artifact_scores))
    return {
        "artifact_score": mean_score,
        "high_freq_ratio": mean_score,
        "suspicious_frames": suspicious_frames[:20],
        "total_frames_analyzed": frame_idx
    }
```

#### 3.2 Liveness Service (`ml-services/liveness_service/`)

```python
# ml-services/liveness_service/rppg.py
import cv2, numpy as np
import mediapipe as mp
from scipy.signal import butter, filtfilt

def extract_rppg_signal(video_path: str) -> dict:
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    rgb_means = []

    # Forehead landmark indices (MediaPipe)
    FOREHEAD_LMKS = [10, 338, 297, 332, 284]

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)
        if results.multi_face_landmarks:
            lmk = results.multi_face_landmarks[0]
            h, w = frame.shape[:2]
            pts = np.array([[int(lmk.landmark[i].x * w),
                             int(lmk.landmark[i].y * h)] for i in FOREHEAD_LMKS])
            mask = np.zeros(frame.shape[:2], dtype=np.uint8)
            cv2.fillConvexPoly(mask, cv2.convexHull(pts), 255)
            roi = cv2.bitwise_and(rgb, rgb, mask=mask)
            valid_pixels = roi[mask == 255]
            if len(valid_pixels) > 0:
                rgb_means.append(valid_pixels.mean(axis=0))

    cap.release()

    if len(rgb_means) < 30:
        return {"pulse_present": False, "estimated_hr_bpm": 0, "signal_quality": 0.0}

    rgb_arr = np.array(rgb_means)
    # CHROM algorithm (De Haan 2013)
    Xs = 3 * rgb_arr[:,0] - 2 * rgb_arr[:,1]
    Ys = 1.5 * rgb_arr[:,0] + rgb_arr[:,1] - 1.5 * rgb_arr[:,2]
    rppg_raw = Xs - (np.std(Xs) / np.std(Ys)) * Ys

    # Bandpass filter 0.75–3.0 Hz (45–180 BPM)
    b, a = butter(3, [0.75/(fps/2), 3.0/(fps/2)], btype='band')
    rppg_filtered = filtfilt(b, a, rppg_raw)

    # FFT to find dominant frequency
    freqs = np.fft.rfftfreq(len(rppg_filtered), 1/fps)
    fft_vals = np.abs(np.fft.rfft(rppg_filtered))
    valid = (freqs >= 0.75) & (freqs <= 3.0)
    dominant_freq = freqs[valid][np.argmax(fft_vals[valid])]
    hr_bpm = dominant_freq * 60

    snr = float(np.max(fft_vals[valid]) / (np.mean(fft_vals) + 1e-8))
    quality = min(1.0, snr / 10.0)

    return {
        "pulse_present": quality > 0.3,
        "estimated_hr_bpm": round(float(hr_bpm), 1),
        "signal_quality": round(quality, 3)
    }
```

```python
# ml-services/liveness_service/blink_detector.py
import cv2, numpy as np
import mediapipe as mp
from scipy.spatial import distance

LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

def eye_aspect_ratio(landmarks, eye_indices, h, w):
    pts = np.array([[int(landmarks[i].x * w), int(landmarks[i].y * h)]
                    for i in eye_indices])
    A = distance.euclidean(pts[1], pts[5])
    B = distance.euclidean(pts[2], pts[4])
    C = distance.euclidean(pts[0], pts[3])
    return (A + B) / (2.0 * C)

def analyze_blinks(video_path: str) -> dict:
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    ear_series, blink_events = [], []
    consec_below = 0
    EAR_THRESH, CONSEC_FRAMES = 0.20, 2

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame.shape[:2]
        result = mp_face_mesh.FaceMesh(max_num_faces=1).process(rgb)
        if result.multi_face_landmarks:
            lmk = result.multi_face_landmarks[0].landmark
            ear = (eye_aspect_ratio(lmk, LEFT_EYE, h, w) +
                   eye_aspect_ratio(lmk, RIGHT_EYE, h, w)) / 2.0
            ear_series.append(ear)
            if ear < EAR_THRESH:
                consec_below += 1
            elif consec_below >= CONSEC_FRAMES:
                blink_events.append(len(ear_series))
                consec_below = 0
            else:
                consec_below = 0

    cap.release()
    duration_min = len(ear_series) / (fps * 60)
    blink_rate = len(blink_events) / max(duration_min, 0.01)
    normal = 15 <= blink_rate <= 25
    regularity = max(0.0, 1.0 - abs(blink_rate - 20) / 20)

    return {
        "blink_count": len(blink_events),
        "blink_rate_per_min": round(blink_rate, 2),
        "regularity_score": round(regularity, 3),
        "normal_range": [15, 25],
        "is_normal": normal
    }
```

#### 3.3 Lip-Sync Service (`ml-services/lipsync_service/`)

```python
# ml-services/lipsync_service/main.py
from fastapi import FastAPI
from pydantic import BaseModel
from cross_modal_transformer import analyze_lipsync

app = FastAPI(title="MAVEN LipSync Service")

class AnalysisRequest(BaseModel):
    video_path: str

@app.post("/analyze")
async def analyze(req: AnalysisRequest):
    return analyze_lipsync(req.video_path)
```

**Cross-Modal Transformer Architecture:**
```
Visual Stream:
  Lip ROI crops (32 frames × 88×88 grayscale)
  → Conv3D(1→32, 3×3×3) → ReLU → MaxPool3D
  → Conv3D(32→64, 3×3×3) → ReLU → AdaptivePool
  → Flatten → Linear(512)
  → Positional Encoding → Transformer Encoder (4L, 8H)
  → [CLS] token → 256-dim visual embedding

Audio Stream:
  MFCC (40 coefficients × T frames)
  → Conv1D(40→128, 5) → ReLU → MaxPool
  → Conv1D(128→256, 3) → ReLU → AdaptivePool
  → Transformer Encoder (4L, 8H)
  → [CLS] token → 256-dim audio embedding

Cross-Attention:
  Q = visual_embedding, K/V = audio_embedding
  → Scaled dot-product attention
  → Cosine similarity → sync_score [0=no sync, 1=perfect sync]
```

---

### Phase 4 — Database Setup (Supabase)
**Duration: Week 2 (parallel with backend)**

See [Section 7](#7-database-schema-supabase) for the full SQL schema.

**Key Supabase features used:**
- **Row Level Security (RLS)**: Users only see their own jobs/results
- **Storage**: Private `maven-videos` bucket with signed URLs
- **Realtime**: Subscribe to `analysis_jobs` table changes in React
- **Edge Functions**: (optional) Webhook triggers for post-processing

---

### Phase 5 — React Frontend
**Duration: Week 5–8**

#### Key Pages

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Landing page, feature overview, CTA |
| **Auth** | `/auth` | Login / Signup (Supabase Auth UI) |
| **Upload** | `/upload` | Drag-and-drop video upload |
| **Dashboard** | `/dashboard` | List of user's analysis jobs + statuses |
| **Result** | `/result/:jobId` | Detailed verdict with charts + explainability |

#### Core Components

**VideoUploader.jsx**
```jsx
// Drag-and-drop, file validation (mp4/webm, max 100MB)
// Shows upload progress (XHR with onUploadProgress)
// On success → redirect to /dashboard with jobId
```

**VerdictCard.jsx**
```jsx
// Large REAL / FAKE / UNCERTAIN badge with confidence %
// Color: green (REAL), red (FAKE), amber (UNCERTAIN)
// Animated gauge chart for overall confidence
```

**ScoreBreakdown.jsx**
```jsx
// Radar chart or bar chart showing 3 layer scores:
// FFT Score | Liveness Score | Sync Score
// Powered by Recharts
```

**SyncTimeline.jsx**
```jsx
// Horizontal timeline showing per-second sync score
// Red segments mark flagged out-of-sync regions
// Overlaid on video scrubber
```

**useRealtime.js (Hook)**
```jsx
import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

export function useJobStatus(jobId) {
  const [status, setStatus] = useState('PROCESSING');
  useEffect(() => {
    const channel = supabase
      .channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'analysis_jobs', filter: `id=eq.${jobId}`
      }, (payload) => setStatus(payload.new.status))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [jobId]);
  return status;
}
```

---

### Phase 6 — Integration, Testing & Deployment
**Duration: Week 8–10**

#### 6.1 Integration Checklist
- [ ] Frontend ↔ Backend API connection verified
- [ ] Backend ↔ Supabase Storage signed URL flow working
- [ ] Backend ↔ Python services (all 3) responding correctly
- [ ] Score fusion producing correct verdicts
- [ ] Supabase Realtime updating React dashboard live
- [ ] Socket.io fallback for real-time updates
- [ ] Auth flow: signup → login → protected routes

#### 6.2 Testing Strategy

| Layer | Tool | Tests |
|-------|------|-------|
| Backend API | Jest + Supertest | Route unit tests, mock ML services |
| ML Services | pytest | Per-function unit tests, known fake/real videos |
| Frontend | React Testing Library | Component render + user interaction tests |
| E2E | Playwright | Upload → result flow end-to-end |
| Load Testing | k6 | Concurrent upload stress test |

#### 6.3 Model Evaluation

| Metric | Target |
|--------|--------|
| AUC-ROC (FaceForensics++) | > 0.93 |
| AUC-ROC (Celeb-DF v2) | > 0.90 |
| Equal Error Rate (EER) | < 8% |
| FFT layer accuracy | > 85% |
| rPPG detection F1 | > 80% |
| Lip-sync F1 | > 87% |
| API response (submit) | < 500ms |
| Full analysis time | < 60s per 30s video |

#### 6.4 Deployment

**Development:**
```bash
docker-compose up --build
# Frontend:  http://localhost:5173
# Backend:   http://localhost:4000
# FFT:       http://localhost:8001
# Liveness:  http://localhost:8002
# LipSync:   http://localhost:8003
```

**Production:**
- Frontend → **Vercel** (auto-deploy from main branch)
- Backend → **Railway** or **Render** (Node.js container)
- Python services → **Modal.com** or **AWS EC2 GPU** instance
- GPU inference → NVIDIA T4 via cloud provider
- Supabase → managed (no self-hosting needed)

---

## 7. Database Schema (Supabase)

```sql
-- Users are managed by Supabase Auth (auth.users)

-- Analysis Jobs
CREATE TABLE analysis_jobs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  video_path    TEXT NOT NULL,
  original_name TEXT,
  status        TEXT CHECK (status IN ('PROCESSING','COMPLETED','FAILED')) DEFAULT 'PROCESSING',
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
  fft_score       FLOAT,       -- 0=real, 1=fake
  liveness_score  FLOAT,       -- 0=fake, 1=real
  sync_score      FLOAT,       -- 0=out-of-sync, 1=in-sync
  details         JSONB,       -- Full per-service JSON payloads
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_user_id ON analysis_jobs(user_id);
CREATE INDEX idx_jobs_status  ON analysis_jobs(status);
CREATE INDEX idx_results_job  ON analysis_results(job_id);

-- Row Level Security
ALTER TABLE analysis_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_jobs" ON analysis_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_results" ON analysis_results
  FOR ALL USING (
    job_id IN (SELECT id FROM analysis_jobs WHERE user_id = auth.uid())
  );

-- Enable Realtime on jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE analysis_jobs;
```

---

## 8. API Reference

### Base URL: `http://localhost:4000/api`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/analysis/submit` | ✅ | Upload video, start analysis |
| `GET` | `/analysis/jobs` | ✅ | List user's analysis jobs |
| `GET` | `/analysis/jobs/:id` | ✅ | Get single job status |
| `GET` | `/results/:jobId` | ✅ | Get full analysis result |
| `DELETE` | `/analysis/jobs/:id` | ✅ | Delete job + video |
| `GET` | `/health` | ❌ | Service health check |

**POST `/analysis/submit`**
```
Content-Type: multipart/form-data
Authorization: Bearer <supabase_jwt>
Body: { video: File }

Response 202:
{
  "jobId": "uuid",
  "message": "Analysis started",
  "estimatedTime": "30-60 seconds"
}
```

**GET `/results/:jobId`**
```
Response 200:
{
  "jobId": "uuid",
  "verdict": "FAKE",
  "confidence": 0.83,
  "breakdown": {
    "fft": { "artifact_score": 0.87, "suspicious_frames": [12,45] },
    "liveness": { "liveness_score": 0.91, "rppg": {...}, "blink": {...} },
    "lipsync": { "sync_score": 0.12, "flagged_segments": [...] }
  },
  "createdAt": "2026-04-06T10:00:00Z"
}
```

---

## 9. ML Model Architecture

### Summary Table

| Service | Input | Core Model | Output Size |
|---------|-------|-----------|-------------|
| FFT | Frame (grayscale) | 2D FFT + HFR calc | Scalar score |
| Liveness | Frame sequence | MediaPipe + CHROM rPPG | HR BPM + quality |
| Blink | Frame sequence | MediaPipe EAR | Rate + regularity |
| LipSync | Lip clips + audio | Cross-Modal Transformer | Sync score [0,1] |

### Training Datasets

| Dataset | Used For | Size |
|---------|----------|------|
| FaceForensics++ | FFT + Liveness training | 1,000 videos × 4 methods |
| Celeb-DF v2 | Generalization testing | 6,229 clips |
| DFDC | Real-world validation | 100,000+ clips |
| LRS3-TED | Lip-sync pre-training (real) | 151,819 utterances |
| DeepFakeTIMIT | Lip-sync fake training | 620 videos |
| ASVspoof 2019 | Audio-only fake training | 121,461 utterances |

---

## 10. Frontend Pages & Components

```
Pages:
├── Home         → Hero, feature cards, demo CTA
├── Auth         → Supabase UI Auth (login/signup tabs)
├── Upload       → Dropzone, file info, submit button
├── Dashboard    → Job history table, status badges, refresh
└── Result       → VerdictCard, ScoreBreakdown, SyncTimeline,
                   rPPG chart, blink stats, suspicious frames

Components:
├── common/
│   ├── Navbar.jsx
│   ├── ProtectedRoute.jsx
│   ├── Loader.jsx
│   └── Alert.jsx
├── upload/
│   ├── DropZone.jsx
│   └── UploadProgress.jsx
├── results/
│   ├── VerdictCard.jsx       (REAL/FAKE badge + confidence)
│   ├── ScoreBreakdown.jsx    (Radar/bar chart of 3 layers)
│   ├── SyncTimeline.jsx      (Per-second sync heatmap)
│   ├── RppgChart.jsx         (Pulse waveform over time)
│   └── BlinkStats.jsx        (Blink rate vs. normal range)
└── dashboard/
    ├── JobTable.jsx
    └── StatusBadge.jsx
```

---

## 11. Timeline & Milestones

```
Week 1     ████  Project setup, Supabase config, Docker, repo init
Week 2     ████  Node.js backend skeleton + auth middleware
Week 3     ████  Upload API + Supabase storage integration
Week 4     ████  FFT Python service (complete + tested)
Week 5     ████  rPPG + Blink Python service (complete + tested)
Week 6     ████  Lip-sync Python service (complete + tested)
Week 7     ████  ML Orchestrator + Score Fusion (Node.js)
Week 8     ████  React frontend — auth, upload, dashboard
Week 9     ████  React frontend — results page + Recharts
Week 10    ████  Integration testing + E2E tests
Week 11    ████  Model evaluation on benchmark datasets
Week 12    ████  Deployment + documentation
```

### Milestones

| # | Milestone | Target |
|---|-----------|--------|
| M1 | Supabase schema + auth working | Week 1 |
| M2 | Video upload + storage pipeline | Week 3 |
| M3 | All 3 ML services returning scores | Week 6 |
| M4 | Full backend pipeline end-to-end | Week 7 |
| M5 | Frontend MVP (upload → result) | Week 9 |
| M6 | AUC > 0.90 on Celeb-DF validation | Week 11 |
| M7 | Production deployment live | Week 12 |

---

## 12. Environment Variables

### Backend (`backend/.env`)
```env
PORT=4000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FFT_SERVICE_URL=http://fft-service:8001
LIVENESS_SERVICE_URL=http://liveness-service:8002
LIPSYNC_SERVICE_URL=http://lipsync-service:8003
```

### Frontend (`frontend/.env`)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BACKEND_URL=http://localhost:4000
```

### Python Services (`ml-services/*/.env`)
```env
PORT=8001        # 8002 for liveness, 8003 for lipsync
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MODEL_WEIGHTS_PATH=./weights/
```

---

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/your-org/maven.git && cd maven

# 2. Install dependencies
cd frontend && npm install && cd ..
cd backend  && npm install && cd ..

# 3. Copy env files
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
# → Fill in Supabase credentials

# 4. Run Supabase migrations
# → Paste SQL from Section 7 into Supabase SQL Editor

# 5. Start all services
docker-compose up --build

# Frontend → http://localhost:5173
# Backend  → http://localhost:4000
# Docs     → http://localhost:8001/docs (FFT FastAPI)
```

---

*MAVEN — Built to defend digital trust against the next generation of synthetic media threats.*
