# MAVEN — Deployment Guide

> **MAVEN** is a multi-service deepfake detection platform composed of a **React frontend**, a **Node.js backend**, and three **Python ML microservices**. All services must be running simultaneously for the full analysis pipeline to work.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [Running the Backend](#5-running-the-backend)
6. [Running the Frontend](#6-running-the-frontend)
7. [Running the ML Services](#7-running-the-ml-services)
   - [FFT Service (Port 8001)](#fft-service-port-8001)
   - [Liveness Service (Port 8002)](#liveness-service-port-8002)
   - [LipSync Service (Port 8003)](#lipsync-service-port-8003)
8. [Port Reference](#8-port-reference)
9. [Health Checks](#9-health-checks)
10. [Troubleshooting](#10-troubleshooting)
11. [Live / Production Deployment](#11-live--production-deployment)
    - [Deployment Strategy](#deployment-strategy)
    - [Step 1 — Provision a VPS](#step-1--provision-a-vps)
    - [Step 2 — Install Server Dependencies](#step-2--install-server-dependencies)
    - [Step 3 — Clone the Repository](#step-3--clone-the-repository)
    - [Step 4 — Configure Environment Variables](#step-4--configure-environment-variables)
    - [Step 5 — Build the Frontend](#step-5--build-the-frontend)
    - [Step 6 — Configure Nginx & TLS](#step-6--configure-nginx--tls)
    - [Step 7 — Deploy with Docker Compose](#step-7--deploy-with-docker-compose)
    - [Step 8 — Deploy the Frontend (Vercel)](#step-8--deploy-the-frontend-vercel)
    - [Production Checklist](#production-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
│                  React + Vite (port 3000)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend                          │
│              Express + Socket.IO (port 4000)                │
│                                                             │
│  Routes: /api/auth  /api/analysis  /api/results             │
│  Orchestrates ML service calls & Supabase Storage           │
└──────┬───────────────┬──────────────────┬───────────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌────────────┐  ┌──────────────┐  ┌──────────────┐
│ FFT Service│  │  Liveness    │  │  LipSync     │
│  (8001)    │  │  Service     │  │  Service     │
│            │  │   (8002)     │  │   (8003)     │
│ Frequency- │  │ rPPG + Blink │  │ Wav2Lip      │
│ domain     │  │ Detection    │  │ SyncNet      │
│ analysis   │  │              │  │              │
└────────────┘  └──────────────┘  └──────────────┘
       │               │                  │
       └───────────────┴──────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Supabase (Cloud)      │
              │  Database + Storage    │
              └────────────────────────┘
```

### Service Responsibilities

| Service | Port | Stack | Role |
|---|---|---|---|
| **Frontend** | `3000` | React + Vite | User interface — upload, results, forensic dashboard |
| **Backend** | `4000` | Node.js + Express + Socket.IO | REST API, ML orchestration, Supabase integration |
| **FFT Service** | `8001` | Python + FastAPI | Frequency-domain artifact detection (GAN/diffusion fingerprints) |
| **Liveness Service** | `8002` | Python + FastAPI | Biological liveness — rPPG heartbeat + eye-blink analysis |
| **LipSync Service** | `8003` | Python + FastAPI | Audio-visual sync detection via Wav2Lip SyncNet |

---

## 2. Prerequisites

### System Requirements

| Tool | Required Version | Notes |
|---|---|---|
| **Node.js** | `≥ 18.x` | Recommend LTS (20.x) |
| **npm** | `≥ 9.x` | Comes with Node.js |
| **Python** | **`3.12.9`** | **Strict requirement — do NOT use 3.13+** (mediapipe, pydantic-core lack wheels) |
| **ffmpeg** | Any recent version | Required by the LipSync service for audio extraction |
| **Git** | Any | For cloning the repository |

> **⚠️ Python Version Warning:** The ML services (`liveness_service` and `lipsync_service`) explicitly require **Python 3.12**. Using Python 3.13+ will cause `mediapipe` and `pydantic-core` installation failures. Each service directory contains a `.python-version` file set to `3.12.9`.

### Install ffmpeg

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install ffmpeg -y

# macOS (Homebrew)
brew install ffmpeg

# Verify
ffmpeg -version
```

---

## 3. Project Structure

```
Maven/
├── backend/                    # Node.js REST API + Socket.IO server
│   ├── src/
│   │   ├── app.js              # Express app setup
│   │   ├── socket.js           # Socket.IO configuration
│   │   ├── config/             # Environment config loader
│   │   ├── controllers/        # Route handlers
│   │   ├── middleware/         # Auth, error, upload middleware
│   │   ├── routes/             # auth, analysis, results routes
│   │   ├── services/           # analysis, auth, ML orchestrator, Supabase
│   │   └── utils/              # Logger and helpers
│   ├── server.js               # Entry point (node server.js)
│   ├── package.json
│   └── .env                    # Backend environment variables (see §4)
│
├── frontend/                   # React + Vite SPA
│   ├── src/
│   │   ├── pages/              # Home, Auth, Analyze, Result, Library, Dashboard, ForensicDashboard
│   │   ├── components/         # Reusable UI components
│   │   ├── context/            # React context providers
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API service layer (axios)
│   │   ├── lib/                # Supabase client, utilities
│   │   └── main.jsx            # App entry point
│   ├── vite.config.js          # Vite config (port 3000, proxies /api → :4000)
│   ├── package.json
│   └── .env                    # Frontend environment variables (see §4)
│
├── ml-services/
│   ├── fft_service/            # FastAPI — FFT deepfake detection (port 8001)
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── analyzer.py         # Core FFT analysis pipeline
│   │   ├── selimsef_predictor.py  # EfficientNet B7 NS (DFDC) predictor
│   │   ├── spectral_analyzer.py
│   │   ├── temporal_analyzer.py
│   │   ├── color_consistency.py
│   │   ├── models/             # Model loading utilities
│   │   ├── weights/            # Downloaded model weights
│   │   └── requirements.txt
│   │
│   ├── liveness_service/       # FastAPI — rPPG + Blink detection (port 8002)
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── rppg.py             # CHROM rPPG signal extraction
│   │   ├── blink_detector.py   # EAR-based blink detection (MediaPipe)
│   │   ├── face_landmarker.py  # MediaPipe face landmark helper
│   │   ├── models/
│   │   │   └── face_landmarker.task   # MediaPipe face model
│   │   └── requirements.txt
│   │
│   └── lipsync_service/        # FastAPI — Wav2Lip SyncNet (port 8003)
│       ├── main.py             # FastAPI app entry point
│       ├── cross_modal_transformer.py  # Core lipsync analysis
│       ├── audio_processor.py  # Audio MFCC extraction (librosa + ffmpeg)
│       ├── lip_tracker.py      # MediaPipe lip landmark tracker
│       ├── models/
│       │   └── face_landmarker.task   # MediaPipe face model
│       └── requirements.txt
│
├── documentation/              # Architecture docs and plans
├── docker/                     # Docker build contexts (future use)
├── nginx.conf                  # Nginx reverse-proxy config (future use)
└── docker-compose.yml          # Docker Compose (future use)
```

---

## 4. Environment Variables

### 4.1 Backend (`backend/.env`)

Create `backend/.env` with the following:

```env
# Supabase credentials (get from your Supabase project settings)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ACCESS_TOKEN=<your-access-token>

# ML Service URLs — must match the ports the services are running on
FFT_SERVICE_URL="http://localhost:8001/analyze"
LIVENESS_SERVICE_URL="http://localhost:8002/analyze"
LIPSYNC_SERVICE_URL="http://localhost:8003/analyze"

# Optional — defaults to 4000 if not set
# PORT=4000
```

### 4.2 Frontend (`frontend/.env`)

Create `frontend/.env` with the following:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_BACKEND_URL=http://localhost:4000
```

> The frontend Vite dev server proxies all `/api/*` requests to `http://localhost:4000`, so `VITE_BACKEND_URL` is only used for WebSocket connections and direct non-proxied calls.

### 4.3 LipSync Service (Optional — `lipsync_service/.env`)

```env
PORT=8003
MODEL_WEIGHTS_PATH=./weights
# Absolute path to ffmpeg if not in system PATH
FFMPEG_PATH=
```

---

## 5. Running the Backend

The backend is a Node.js Express + Socket.IO server that runs on **port 4000**.

```bash
cd backend
npm install          # first time only
npm run dev
```

**What happens:**
- Loads `.env` via `dotenv`
- Validates required Supabase environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- Starts Express server with Socket.IO on port `4000`
- Exposes REST routes: `/api/auth`, `/api/analysis`, `/api/results`
- ML orchestrator connects to FFT (`:8001`), Liveness (`:8002`), and LipSync (`:8003`) services

**Expected output:**
```
🚀 MAVEN Backend running on port 4000
📡 Environment: development
```

---

## 6. Running the Frontend

The frontend is a React + Vite SPA that runs on **port 3000**.

```bash
cd frontend
npm install          # first time only
npm run dev
```

**What happens:**
- Starts Vite dev server on `http://localhost:3000`
- Proxies `/api/*` → `http://localhost:4000` (defined in `vite.config.js`)
- Hot Module Replacement (HMR) is enabled for fast development iteration

**Expected output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

> **Note:** The frontend requires the backend to be running for auth, uploads, and analysis to work. Start the backend first.

---

## 7. Running the ML Services

All three ML services use **Python 3.12.9**. Each service has its own virtual environment (`.venv`) and dependencies.

### Python Environment Setup (One-time per service)

Repeat these steps for each service directory:

```bash
# Verify Python version (must be 3.12.x)
python3 --version    # or: python --version

# If using pyenv:
pyenv local 3.12.9

# Create virtual environment
python3.12 -m venv .venv

# Activate virtual environment
source .venv/bin/activate      # Linux / macOS
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt
```

---

### FFT Service (Port 8001)

**Purpose:** Frequency-domain deepfake detection. Extracts frames, computes 2D FFT per frame, measures high-frequency energy ratios, and uses an EfficientNet B7 NS DFDC classifier + ViT (dima806) classifier for fake probability scoring.

```bash
cd ml-services/fft_service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**On startup, the service pre-loads:**
- ViT classifier (`dima806` — HuggingFace)
- DFDC EfficientNet B7 NS model (from `weights/` directory)

**Expected startup output:**
```
INFO:     FFT Service starting up — pre-loading deepfake classifiers...
INFO:     ViT classifier (dima806) ready.
INFO:     DFDC EfficientNet B7 NS ready.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

**API:**
- `GET  /health` → `{ "status": "ok", "service": "fft-service" }`
- `POST /analyze` → Accepts `{ "video_path": "...", "max_frames": 30, "frame_step": 1 }`
- `GET  /docs` → Interactive Swagger UI

> **Note:** The FFT service accepts a **local file path** for `video_path`, unlike the other two services which accept signed Supabase URLs. The backend orchestrator handles this distinction.

---

### Liveness Service (Port 8002)

**Purpose:** Biological liveness detection using remote photoplethysmography (rPPG via the CHROM algorithm) and eye-blink analysis (EAR via MediaPipe Face Mesh). Detects physiological signals that synthetic deepfakes cannot replicate.

**Score fusion:** `liveness_score = 0.70 × rPPG_quality + 0.30 × blink_regularity`

```bash
cd ml-services/liveness_service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8002 --reload
```

**Expected startup output:**
```
INFO:     Liveness Service starting up...
INFO:     rPPG algorithm: CHROM (De Haan & Jeanne, 2013)
INFO:     Blink algorithm: EAR (Soukupova & Cech, 2016)
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8002 (Press CTRL+C to quit)
```

**API:**
- `GET  /health` → `{ "status": "ok", "service": "liveness-service" }`
- `POST /analyze` → Accepts `{ "video_url": "<supabase-signed-url>", "job_id": "<uuid>" }`
- `GET  /docs` → Interactive Swagger UI

> **Note:** This service downloads the video from a **Supabase signed URL** to a temporary file, runs analysis, then deletes the temp file automatically.

---

### LipSync Service (Port 8003)

**Purpose:** Audio-visual lip-sync detection using the Wav2Lip pre-trained SyncNet discriminator. Detects mismatches between lip movements and speech phonemes — the primary signal for dubbing-based deepfakes and audio-swap attacks.

**Requires `ffmpeg` installed and available in system PATH** (or set `FFMPEG_PATH` in `.env`).

```bash
cd ml-services/lipsync_service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

**Expected startup output:**
```
INFO:     LipSync Service starting up...
INFO:     Sync algorithm: Wav2Lip SyncNet discriminator (Prajwal et al., 2020)
INFO:     Lip tracking: MediaPipe Face Mesh outer lip landmarks
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8003 (Press CTRL+C to quit)
```

**API:**
- `GET  /health` → `{ "status": "ok", "service": "lipsync-service" }`
- `POST /analyze` → Accepts `{ "video_url": "<supabase-signed-url>", "job_id": "<uuid>" }`
- `GET  /docs` → Interactive Swagger UI

> **Note:** Like the liveness service, this service downloads from a **Supabase signed URL** and deletes the temp file after analysis.

---

## 8. Port Reference

| Service | URL | Protocol |
|---|---|---|
| Frontend | `http://localhost:3000` | HTTP (Vite dev server) |
| Backend | `http://localhost:4000` | HTTP + WebSocket (Socket.IO) |
| FFT Service | `http://localhost:8001` | HTTP (FastAPI / uvicorn) |
| Liveness Service | `http://localhost:8002` | HTTP (FastAPI / uvicorn) |
| LipSync Service | `http://localhost:8003` | HTTP (FastAPI / uvicorn) |

**Swagger / OpenAPI Docs (development only):**

| Service | Docs URL |
|---|---|
| FFT Service | `http://localhost:8001/docs` |
| Liveness Service | `http://localhost:8002/docs` |
| LipSync Service | `http://localhost:8003/docs` |

---

## 9. Health Checks

Verify all services are running with a single command block:

```bash
echo "=== Backend ===" && curl -s http://localhost:4000/api/health 2>/dev/null || echo "NOT RUNNING"
echo "=== FFT Service ===" && curl -s http://localhost:8001/health
echo "=== Liveness Service ===" && curl -s http://localhost:8002/health
echo "=== LipSync Service ===" && curl -s http://localhost:8003/health
```

All healthy services return:

```json
{ "status": "ok", "service": "<service-name>" }
```

---

## 10. Troubleshooting

### `ModuleNotFoundError` or `ImportError` on ML service start

The virtual environment is not active or dependencies are missing.

```bash
# Re-activate and reinstall
source .venv/bin/activate
pip install -r requirements.txt
```

### `mediapipe` installation fails

Python version is not 3.12. Mediapipe does not publish wheels for 3.13+.

```bash
python --version   # Must be 3.12.x
# Use pyenv to install and pin the correct version
pyenv install 3.12.9
pyenv local 3.12.9
```

### Backend fails with `Missing required environment variable: SUPABASE_URL`

The `backend/.env` file is missing or has incorrect values. Confirm the file exists and `SUPABASE_URL` is set.

### Frontend shows blank page or API errors

1. Confirm the backend is running on port `4000`
2. Confirm `frontend/.env` has `VITE_BACKEND_URL=http://localhost:4000`
3. Check the browser console for CORS or network errors

### `ffmpeg not found` in LipSync Service

FFmpeg is not installed or not in PATH.

```bash
# Install (Ubuntu)
sudo apt install ffmpeg -y

# Verify
which ffmpeg
ffmpeg -version

# OR set the path explicitly in lipsync_service/.env
FFMPEG_PATH=/usr/bin/ffmpeg
```

### FFT model weights not loading

If the DFDC EfficientNet model fails to load at startup, the service will fall back to ViT-only mode. To fully enable it, ensure the weights are present in `ml-services/fft_service/weights/`. The service logs will indicate which models loaded successfully.

### Port already in use

```bash
# Find and kill the process using a port
sudo lsof -i :<PORT>
sudo kill -9 <PID>
```

---

## 11. Live / Production Deployment

### Deployment Strategy

MAVEN's services have very different hosting requirements:

| Service | Hosting requirement | Recommended platform |
|---|---|---|
| **Frontend** | Static file hosting | **Vercel** (free tier works) |
| **Backend** | Persistent server (Socket.IO needs sticky connections) | **VPS** (Ubuntu 22.04) |
| **FFT Service** | CPU-heavy, ~2–4 GB RAM, model weights on disk | **VPS** (same server as backend) |
| **Liveness Service** | CPU-moderate, ~1–2 GB RAM | **VPS** (same server) |
| **LipSync Service** | CPU-moderate, needs ffmpeg | **VPS** (same server) |

> **Why a VPS for ML services?** The Python services use PyTorch, MediaPipe, and large model weights (~267 MB for FFT alone). Serverless platforms (Vercel, Render free tier) have memory limits and cold-start problems that make them unsuitable. A dedicated VPS gives you persistent disk for weights and reliable process uptime.

The recommended setup:
- **Frontend** → Vercel (instant deploys, global CDN, free)
- **Backend + all 3 ML services** → single Ubuntu VPS behind Nginx (Docker Compose)

---

### Step 1 — Provision a VPS

Create an Ubuntu 22.04 LTS server with at least:

| Resource | Minimum | Recommended |
|---|---|---|
| **CPU** | 2 vCPUs | 4 vCPUs |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 30 GB SSD | 50 GB SSD |
| **OS** | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

**Recommended providers:** DigitalOcean Droplet, Hetzner Cloud CX22, Linode/Akamai, AWS EC2 t3.medium.

After provisioning:
1. Point your domain's **A record** to the server's public IP.
2. Open firewall ports **80** (HTTP) and **443** (HTTPS) — ports 4000, 8001–8003 should remain **closed** to the public (only accessible internally via Docker's `maven-internal` network).

```bash
# DigitalOcean / UFW example
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

### Step 2 — Install Server Dependencies

SSH into your VPS and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker
docker --version
docker compose version

# Install Git
sudo apt install git -y
```

---

### Step 3 — Clone the Repository

```bash
# Clone to /opt/maven (or any location you prefer)
sudo mkdir -p /opt/maven
sudo chown $USER:$USER /opt/maven
git clone https://github.com/<your-org>/Maven.git /opt/maven
cd /opt/maven
```

---

### Step 4 — Configure Environment Variables

Create the root-level `.env` file that `docker-compose.yml` reads:

```bash
cp .env.production.example .env
nano .env   # or vim .env
```

Fill in your real Supabase credentials:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ACCESS_TOKEN=<your-access-token>
```

> The ML service URLs are already set to internal Docker hostnames (`http://fft-service:8001/analyze`, etc.) inside `docker-compose.yml` — you do **not** need to configure those manually.

---

### Step 5 — Build the Frontend

The React frontend must be built into static files before Nginx can serve it.

**Option A — Build on the server** (requires Node.js installed on VPS):

```bash
# Install Node.js 20 on the VPS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build the frontend
cd /opt/maven/frontend
npm ci

# Create production .env for the build
cat > .env << EOF
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_BACKEND_URL=https://yourdomain.com
EOF

npm run build
# Output is written to frontend/dist/
cd /opt/maven
```

**Option B — Build locally and upload** (if you prefer not to install Node on the VPS):

```bash
# On your local machine:
cd frontend
# Set VITE_BACKEND_URL to your production domain
VITE_BACKEND_URL=https://yourdomain.com npm run build

# Upload the built dist/ to the server
rsync -avz dist/ user@your-server-ip:/opt/maven/frontend/dist/
```

---

### Step 6 — Configure Nginx & TLS

#### 6.1 Update the domain in nginx.conf

Edit [`nginx.conf`](file:///home/adnanmalik/Dev/projects/Maven/nginx.conf) and replace `yourdomain.com` with your actual domain in both the `server_name` and `ssl_certificate` lines:

```bash
nano /opt/maven/nginx.conf
# Replace: yourdomain.com → your actual domain
```

#### 6.2 Obtain a TLS certificate with Certbot

Certbot runs **before** you start Nginx for the first time (it needs port 80 free).

```bash
# Install Certbot
sudo apt install certbot -y

# Issue certificate (standalone mode — temporarily uses port 80)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates are saved to:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

Certbot auto-renews certificates via a system timer. Verify renewal works:

```bash
sudo certbot renew --dry-run
```

> **Note:** The `docker-compose.yml` mounts `/etc/letsencrypt` as a read-only volume into the Nginx container, so certificates are automatically available inside Docker.

---

### Step 7 — Deploy with Docker Compose

From the project root on your VPS:

```bash
cd /opt/maven

# Build all images and start all services in detached mode
docker compose up --build -d

# Watch startup logs (optional)
docker compose logs -f

# Check all containers are healthy
docker compose ps
```

Expected output of `docker compose ps`:

```
NAME               STATUS                        PORTS
maven-backend      Up (healthy)                  0.0.0.0:4000->4000/tcp
maven-fft          Up (healthy)                  0.0.0.0:8001->8001/tcp
maven-liveness     Up (healthy)                  0.0.0.0:8002->8002/tcp
maven-lipsync      Up (healthy)                  0.0.0.0:8003->8003/tcp
maven-nginx        Up                            0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

#### Useful Docker Compose Commands

```bash
# Restart a single service without rebuilding
docker compose restart backend

# Rebuild and redeploy a single service after a code change
docker compose up --build -d backend

# Tail logs for a specific service
docker compose logs -f fft-service

# Stop everything
docker compose down

# Stop and remove all volumes (⚠ destroys persistent data)
docker compose down -v
```

#### Deploying Updates (CI/CD Workflow)

When you push new code and want to redeploy:

```bash
cd /opt/maven
git pull origin main

# Rebuild only the changed service(s)
docker compose up --build -d backend

# Or rebuild everything
docker compose up --build -d
```

For automated deploys, you can set up a GitHub Actions workflow that SSHs into the VPS and runs the above commands on push to `main`.

---

### Step 8 — Deploy the Frontend (Vercel)

The React frontend is best deployed to **Vercel** for zero-config CDN delivery and instant previews on every PR.

#### 8.1 Connect the repository

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Set **Root Directory** to `frontend`
4. Framework preset will be auto-detected as **Vite**

#### 8.2 Set environment variables in Vercel

In the Vercel dashboard under **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_BACKEND_URL` | `https://yourdomain.com` (your VPS domain) |

#### 8.3 Configure Vercel build settings

In **Settings → Build & Development Settings**:

| Setting | Value |
|---|---|
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm ci` |

#### 8.4 Update CORS on the backend

Once Vercel assigns your frontend a domain (e.g. `maven.vercel.app` or your custom domain), update the backend's CORS config in [`backend/src/app.js`](file:///home/adnanmalik/Dev/projects/Maven/backend/src/app.js) to allow that origin:

```js
// backend/src/app.js
app.use(cors({
  origin: [
    'https://maven.vercel.app',   // ← your Vercel domain
    'https://yourdomain.com',     // ← custom domain if set
  ],
  credentials: true,
}));

// Also update Socket.IO CORS:
const io = new Server(httpServer, {
  cors: {
    origin: ['https://maven.vercel.app', 'https://yourdomain.com'],
    methods: ['GET', 'POST'],
  },
});
```

Then rebuild and redeploy the backend:

```bash
cd /opt/maven
docker compose up --build -d backend
```

---

### Production Checklist

Before going live, verify each item:

- [ ] VPS firewall: ports **80** and **443** open; ports 4000, 8001–8003 closed to public
- [ ] `.env` filled with real Supabase credentials (not example values)
- [ ] `nginx.conf` updated with your real domain name
- [ ] TLS certificate issued by Certbot and `certbot renew --dry-run` passes
- [ ] `frontend/dist/` is present (frontend has been built)
- [ ] All 5 Docker containers show `Up (healthy)` in `docker compose ps`
- [ ] `curl https://yourdomain.com/health` returns `{"status":"ok"}`
- [ ] FFT weights file present: `ml-services/fft_service/weights/dfdc_efficientnet_b7_ns.pth` (~267 MB)
- [ ] Vercel environment variables set (VITE_BACKEND_URL points to your VPS domain)
- [ ] Backend CORS updated to allow the Vercel frontend origin
- [ ] Supabase Storage bucket CORS allows your frontend origin
- [ ] Certbot auto-renewal cron/timer is active: `systemctl status certbot.timer`

---

*Generated for MAVEN — deepfake detection platform.*
