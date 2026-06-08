# 🛡️ Real-Time Deepfake Detection System for Live Streams
### — A Complete Engineering Blueprint —

> **Purpose**: This document is written for an engineer who will implement this system. It covers every layer — from signal capture to model inference to alerting — with specific repositories, papers, datasets, and code references.

---

## 📌 Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [System Overview](#2-system-overview)
3. [Full Pipeline Architecture](#3-full-pipeline-architecture)
4. [Module Breakdown](#4-module-breakdown)
5. [Full Tech Stack](#5-full-tech-stack)
6. [Key Open-Source Repositories](#6-key-open-source-repositories)
7. [Datasets](#7-datasets)
8. [Research Papers (Must-Read)](#8-research-papers-must-read)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Challenges & Mitigations](#11-challenges--mitigations)
12. [Quick-Start Code Snippets](#12-quick-start-code-snippets)

---

## 1. Problem Statement

Live-stream deepfakes involve:

| Attack Vector | Description |
|---|---|
| **Face Swap (Video)** | GAN/diffusion-generated face replacement in video feed |
| **Lip Sync / Puppeteering** | Driving someone's face with different audio |
| **Voice Cloning** | TTS/VC models cloning a person's voice in real-time |
| **Full Avatar** | Fully synthetic 3D avatar passed as a real person |
| **AV Mismatch** | Real video + cloned voice, or vice versa |

The system must handle **all five** with **< 500ms latency** for live streams.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         LIVE STREAM SOURCE                        │
│           (RTMP / WebRTC / HLS / NDI / OBS / Zoom API)           │
└──────────────────┬──────────────────────┬────────────────────────┘
                   │                      │
             VIDEO TRACK              AUDIO TRACK
                   │                      │
         ┌─────────▼────────┐   ┌─────────▼────────┐
         │  Face Detection  │   │ Audio Pre-Process │
         │  & Alignment     │   │ (VAD, Denoise)    │
         └─────────┬────────┘   └─────────┬────────┘
                   │                      │
         ┌─────────▼────────┐   ┌─────────▼────────┐
         │ Video Deepfake   │   │  Voice Deepfake   │
         │ Detector         │   │  Detector         │
         │ (SBI/LipForensics│   │  (AASIST/RawNet2) │
         └─────────┬────────┘   └─────────┬────────┘
                   │                      │
         ┌─────────▼──────────────────────▼────────┐
         │         Cross-Modal Fusion Layer          │
         │    (AV Sync Check + Score Aggregation)    │
         └──────────────────┬───────────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │  Decision Engine   │
                  │  (Threshold/Rules) │
                  └─────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Dashboard      Alert API     Stream Tag
         (Real-time)    (Webhook)     (Metadata)
```

---

## 3. Full Pipeline Architecture

### Data Flow (Step-by-Step)

```
1. Ingest Live Stream
   └─► Decode to raw frames + PCM audio using FFmpeg/GStreamer

2. Video Branch
   ├─► Face Detection (RetinaFace / MTCNN / YOLOv8-face)
   ├─► Face Alignment (dlib 68-pt / MediaPipe / InsightFace)
   ├─► Temporal Windowing (16–32 frame clips)
   └─► Model Inference → Video Fake Score [0.0 – 1.0]

3. Audio Branch
   ├─► Voice Activity Detection (WebRTC VAD / Silero VAD)
   ├─► Feature Extraction (MFCC / Mel-Spectrogram / LFCC / Raw)
   └─► Model Inference → Audio Fake Score [0.0 – 1.0]

4. AV Sync Check
   └─► Lip-sync consistency using SyncNet → AV Sync Score [0.0–1.0]

5. Fusion
   └─► Weighted ensemble of [video_score, audio_score, av_sync_score]
       → Final Composite Score

6. Decision
   ├─► If Score > Threshold → FLAG as FAKE
   └─► Emit: WebSocket event / Webhook / DB entry / stream overlay
```

---

## 4. Module Breakdown

### 4.1 Video Capture & Frame Extraction

**Goal**: Extract quality frames from a live stream in real-time.

**Tools**:
- `FFmpeg` — Universal stream decoder (RTMP, HLS, WebRTC)
- `GStreamer` — Alternative, lower latency
- `PyAV` — Python bindings for FFmpeg
- `OpenCV VideoCapture` — Simple but limited for live protocols

**Key Params**:
- Target FPS: **15–30 fps** for inference
- Batch: **16 consecutive frames** per inference window
- Stride: **8 frames** (50% overlap for continuity)

**Code ref**: `https://github.com/kkroening/ffmpeg-python`

---

### 4.2 Face Detection & Alignment

**Goal**: Reliably locate and crop face from each frame.

| Library | Pros | Speed |
|---|---|---|
| **RetinaFace** | Accurate, handles occlusion | Medium |
| **MTCNN** | Good landmark detection | Slower |
| **MediaPipe Face Mesh** | Real-time, 468 landmarks | Fast |
| **YOLOv8-face** | Very fast, production-ready | Very Fast |
| **InsightFace** | Best quality overall | Medium |

**Recommended**: `InsightFace` for quality, `YOLOv8-face` for speed.

| Repo | URL |
|---|---|
| InsightFace | `https://github.com/deepinsight/insightface` |
| MediaPipe | `https://github.com/google/mediapipe` |
| YOLOv8-face | `https://github.com/akanametov/yolo-face` |

**Alignment**: Use 5-point facial landmarks → affine transform → 224×224 crop

---

### 4.3 Video Deepfake Detection (Face)

#### Option A — XceptionNet (Baseline Classic)
- Architecture: Xception (depthwise separable CNN)
- Trained on: FaceForensics++; best for compression/GAN artifacts
- Repo: `https://github.com/ondyari/FaceForensics`

#### Option B — EfficientNet-B4
- Trained on DFDC dataset
- Repo: `https://github.com/selimsef/dfdc_deepfake_challenge`

#### Option C — SBI / Self-Blended Images (SOTA, Recommended)
- Architecture: EfficientNet with self-blended image training
- Paper: *Detecting Deepfakes with Self-Blended Images* (CVPR 2022)
- Repo: `https://github.com/mapooon/SelfBlendedImages`
- **Best generalization to unseen deepfakes**

#### Option D — LipForensics (Temporal Lip Analysis)
- Focuses on lip motion inconsistencies over time
- Repo: `https://github.com/ahaliassos/LipForensics`

#### Option E — FTCN (Fully Temporal CNN)
- Repo: `https://github.com/yinglinzheng/FTCN`

#### Option F — UniForensics (2024 SOTA)
- Unified multi-domain detector
- Repo: `https://github.com/YZY-stack/UniForensics`

**Recommended Production Stack**:
```
Primary:   SBI (EfficientNet backbone) — good generalization
Secondary: LipForensics — lip sync specific
Ensemble:  Average of both scores
```

---

### 4.4 Audio Capture & Pre-processing

**Goal**: Extract clean speech features from the audio track.

**Steps**:
1. Demux audio from stream → 16kHz mono PCM
2. VAD (Voice Activity Detection) → only process speech
3. Noise Reduction → clean the signal
4. Segmentation → 1–4 second windows

**Tools**:
- `webrtcvad`: `https://github.com/wiseman/py-webrtcvad`
- `silero-vad` (neural): `https://github.com/snakers4/silero-vad`
- `noisereduce`: `https://github.com/timsainb/noisereduce`
- `librosa`, `torchaudio`

**Features to extract**:
```
- MFCC (13–40 coefficients)         ← classic
- LFCC (Linear Frequency Cepstrum)  ← better for spoofing detection
- Mel-Spectrogram (128 bins)        ← for CNN models
- Raw waveform                      ← for RawNet2/AASIST
```

---

### 4.5 Voice Deepfake / Spoofing Detection

Based on ASVspoof challenge models — the gold standard.

#### Option A — RawNet2 (End-to-End)
- Takes raw waveform, no hand-crafted features needed
- Paper: *End-to-end anti-spoofing with RawNet2* (Jung et al., 2020)
- Repo: `https://github.com/asvspoof-challenge/2021`

#### Option B — AASIST (SOTA 2021–2023, Recommended)
- Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention
- Paper: *AASIST* (Jung et al., Interspeech 2022)
- Repo: `https://github.com/clovaai/aasist`

#### Option C — Wav2Vec2 Fine-tuned
- Meta SSL model fine-tuned on ASVspoof
- HuggingFace: `https://huggingface.co/m3hrdadfi/wav2vec2-fake`

#### Option D — SAMO (2024 SOTA)
- One-class speaker anti-spoofing
- Repo: `https://github.com/sivannavis/SAMO`

**Recommended**: `AASIST` primary + `RawNet2` secondary (ensemble)

---

### 4.6 Cross-Modal Fusion (AV Sync)

**Goal**: Detect when audio and video are not from the same person/recording.

| Tool | Description | Repo |
|---|---|---|
| **SyncNet** | Lip-sync consistency check (MFCC vs mouth) | https://github.com/joonson/syncnet_python |
| **AV-HuBERT** | Cross-modal BERT for AV learning | https://github.com/facebookresearch/av_hubert |
| **DINet** | Dubbing deepfake via AV inconsistency | https://github.com/MRzzm/DINet |

**Fusion Formula**:
```python
composite_score = (
    0.40 * video_fake_score +
    0.35 * audio_fake_score +
    0.25 * (1.0 - av_sync_score)  # low sync → higher fake probability
)
```
> Weights should be tuned on your validation set.

---

### 4.7 Decision Engine & Alert System

**Threshold Logic**:
```python
THRESHOLDS = {
    "REAL":        score < 0.35,
    "UNCERTAIN":   0.35 <= score < 0.65,
    "LIKELY_FAKE": 0.65 <= score < 0.85,
    "FAKE":        score >= 0.85
}
```

**Alert Channels**:
- **WebSocket** → Real-time dashboard update
- **REST Webhook** → Notify platform (Twitch / YouTube / Zoom)
- **Database** → Log event with timestamp, clip hash, scores
- **Stream Overlay** → Embed metadata/warning in stream output

---

## 5. Full Tech Stack

### Core Language
| Purpose | Tool |
|---|---|
| Main orchestration | **Python 3.10+** |
| High-perf inference | **C++ w/ ONNX Runtime** (optional) |
| Frontend dashboard | **React + WebSocket** |

### Deep Learning
| Purpose | Library |
|---|---|
| Model training/inference | **PyTorch 2.x** |
| Model serving | **TorchServe** or **ONNX Runtime** |
| Audio DL | **torchaudio** |
| Vision transformers | **timm** (PyTorch Image Models) |
| Pretrained models | **HuggingFace Transformers / Hub** |

### Stream Processing
| Purpose | Tool |
|---|---|
| Video decoding | **FFmpeg**, **PyAV** |
| Real-time streaming | **GStreamer**, **aiortc** (WebRTC) |
| Audio processing | **librosa**, **soundfile**, **pyaudio** |
| VAD | **silero-vad**, **webrtcvad** |

### Serving / Infrastructure
| Purpose | Tool |
|---|---|
| API server | **FastAPI** (async) |
| Task queue | **Celery + Redis** |
| Message broker | **Apache Kafka** (for scale) |
| Container | **Docker + Docker Compose** |
| Orchestration | **Kubernetes** (production) |
| GPU runtime | **NVIDIA CUDA 12**, **TensorRT** |
| Model acceleration | **ONNX Runtime** / **TensorRT** |

### Storage & Monitoring
| Purpose | Tool |
|---|---|
| Database | **PostgreSQL** (events) + **Redis** (cache) |
| Object storage | **MinIO** / AWS S3 (clip evidence) |
| Monitoring | **Prometheus + Grafana** |
| Logging | **ELK Stack** |
| MLOps | **MLflow** |

---

## 6. Key Open-Source Repositories

### Video Deepfake Detection
| Repo | Description | Link |
|---|---|---|
| **FaceForensics++** | Benchmark + XceptionNet baseline | https://github.com/ondyari/FaceForensics |
| **SelfBlendedImages** | CVPR 2022 SOTA, best generalization | https://github.com/mapooon/SelfBlendedImages |
| **LipForensics** | Temporal lip analysis | https://github.com/ahaliassos/LipForensics |
| **FTCN** | Fully temporal CNN | https://github.com/yinglinzheng/FTCN |
| **DFDC Winner** | Facebook DFDC 1st place | https://github.com/selimsef/dfdc_deepfake_challenge |
| **UniForensics** | Unified multi-domain detector | https://github.com/YZY-stack/UniForensics |
| **DeepwareScanner** | Production-ready scanner | https://github.com/deepware/deepfake-scanner |
| **AltFreezing** | Spatial-temporal decoupling | https://github.com/zhywyx/AltFreezing |

### Voice / Audio Anti-Spoofing
| Repo | Description | Link |
|---|---|---|
| **AASIST** | SOTA anti-spoofing model | https://github.com/clovaai/aasist |
| **ASVspoof2021 Baseline** | Official challenge models | https://github.com/asvspoof-challenge/2021 |
| **SAMO** | 2024 SOTA voice anti-spoofing | https://github.com/sivannavis/SAMO |
| **Wav2Vec2 Anti-Spoof** | HuggingFace fine-tune | https://huggingface.co/m3hrdadfi/wav2vec2-fake |
| **FakeAVCeleb Tools** | Audio-visual fake detection | https://github.com/DASH-Lab/FakeAVCeleb |
| **WaveFake** | Vocoder-generated fake analysis | https://github.com/RUB-SysSec/WaveFake |

### AV Sync / Cross-Modal
| Repo | Description | Link |
|---|---|---|
| **SyncNet** | Lip-sync alignment checker | https://github.com/joonson/syncnet_python |
| **AV-HuBERT** | Audio-visual cross-modal BERT | https://github.com/facebookresearch/av_hubert |
| **DINet** | Dubbing deepfake detection | https://github.com/MRzzm/DINet |

### Face Detection / Alignment
| Repo | Description | Link |
|---|---|---|
| **InsightFace** | Best overall face detection+recognition | https://github.com/deepinsight/insightface |
| **YOLOv8-face** | Fastest face detection | https://github.com/akanametov/yolo-face |
| **MediaPipe** | Google real-time face mesh | https://github.com/google/mediapipe |

### Streaming / Infrastructure
| Repo | Description | Link |
|---|---|---|
| **ffmpeg-python** | Python FFmpeg bindings | https://github.com/kkroening/ffmpeg-python |
| **aiortc** | WebRTC in Python | https://github.com/aiortc/aiortc |
| **PyAV** | PyTorch-compatible video | https://github.com/PyAV-Org/PyAV |
| **Silero VAD** | Neural VAD | https://github.com/snakers4/silero-vad |
| **Mediamtx** | RTMP/HLS server | https://github.com/bluenviron/mediamtx |
| **TorchServe** | PyTorch model serving | https://github.com/pytorch/serve |

---

## 7. Datasets

### Video Deepfake Datasets
| Dataset | Size | Description | Access |
|---|---|---|---|
| **FaceForensics++** | 1000 videos | 5 manipulation methods | https://github.com/ondyari/FaceForensics |
| **DFDC (Facebook)** | 100K+ videos | Most diverse faces dataset | https://ai.facebook.com/datasets/dfdc/ |
| **Celeb-DF v2** | 6000 videos | High-quality celebrity deepfakes | https://github.com/yuezunli/celeb-deepfakeforensics |
| **WildDeepfake** | 7314 clips | In-the-wild, harder to detect | https://github.com/deepfakeinthewild/deepfake-in-the-wild |
| **FakeAVCeleb** | 19.5K videos | Audio + Video fakes | https://github.com/DASH-Lab/FakeAVCeleb |
| **DGM4** | 77K clips | Multimodal disinformation | https://github.com/BadUniversal/DGM4 |

### Audio Spoofing Datasets
| Dataset | Description | Access |
|---|---|---|
| **ASVspoof 2019** | LA/PA tracks, TTS + VC attacks | https://datashare.ed.ac.uk/handle/10283/3336 |
| **ASVspoof 2021** | Real-world conditions | https://zenodo.org/record/4837263 |
| **In-the-Wild** | Real spoofed speech from internet | https://deepfake-total.com/ |
| **WaveFake** | 6 neural vocoders fake speech | https://github.com/RUB-SysSec/WaveFake |
| **ADD 2022/2023** | Audio deepfake detection challenge | http://addchallenge.cn/ |

---

## 8. Research Papers (Must-Read)

### Video Deepfake Detection
| Paper | Year | Key Contribution | arXiv |
|---|---|---|---|
| FaceForensics++ | 2019 | Benchmark + XceptionNet | https://arxiv.org/abs/1901.08971 |
| Face X-Ray | 2020 | Blending boundary detection | https://arxiv.org/abs/1912.13458 |
| Self-Blended Images | 2022 | Powerful self-supervised method | https://arxiv.org/abs/2204.08376 |
| LipForensics | 2021 | Lip-region temporal analysis | https://arxiv.org/abs/2012.07657 |
| FTCN | 2021 | Temporal consistency analysis | https://arxiv.org/abs/2108.10448 |
| UniForensics | 2024 | Universal forensics framework | https://arxiv.org/abs/2405.19650 |
| AltFreezing | 2023 | Spatial-temporal decoupling | https://arxiv.org/abs/2307.08317 |

### Audio Spoofing / Voice Deepfake
| Paper | Year | Key Contribution | arXiv |
|---|---|---|---|
| RawNet2 | 2020 | Raw waveform anti-spoofing | https://arxiv.org/abs/2011.01108 |
| AASIST | 2022 | Graph attention spectro-temporal | https://arxiv.org/abs/2110.01200 |
| Wav2Vec2 Anti-spoof | 2021 | SSL for anti-spoofing | https://arxiv.org/abs/2109.00700 |
| SAMO | 2023 | One-class speaker anti-spoofing | https://arxiv.org/abs/2309.05834 |
| WaveFake | 2021 | Vocoder-generated fake detection | https://arxiv.org/abs/2111.02813 |

### Audio-Visual / Cross-Modal
| Paper | Year | Key Contribution | arXiv/Link |
|---|---|---|---|
| SyncNet | 2016 | Lip sync in the wild | https://arxiv.org/abs/1611.05358 |
| FakeAVCeleb | 2022 | AV deepfake dataset + baselines | https://arxiv.org/abs/2108.05080 |
| AV-HuBERT | 2022 | Self-supervised AV learning | https://arxiv.org/abs/2201.02184 |
| Emotions Don't Lie | 2023 | Emotion consistency detection | https://arxiv.org/abs/2003.06027 |

---

## 9. Deployment Architecture

### Setup A — Development (Single Machine)
```
OBS / Test Stream
     │ RTMP
     ▼
FFmpeg (local decoder)
     │
Python FastAPI Service (GPU)
├── Video Detector (EfficientNet/SBI)
├── Audio Detector (AASIST)
├── AV Sync (SyncNet)
└── Fusion + WebSocket Alert
     │
Browser Dashboard (React, localhost:3000)
```

### Setup B — Production (Docker + GPU Server)
```
                    ┌────────────────────────────────┐
RTMP/WebRTC/HLS ───►│  Ingestion: Mediamtx / nginx   │
                    └──────────────┬─────────────────┘
                                   │ frames + PCM
                          Kafka Topic: raw_streams
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                    ▼
        Video Worker          Audio Worker         AV Sync Worker
      (GPU, TorchServe)     (GPU, TorchServe)    (GPU/CPU)
               │                   │                    │
               └───────────────────┼───────────────────┘
                                   │
                         Kafka Topic: scores
                                   │
                       Fusion & Decision Service
                              (FastAPI)
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                    ▼
          PostgreSQL           Redis Cache         React Dashboard
          (event log)        (live scores)        (WebSocket WS://)
```

### Latency Budget
| Stage | Target |
|---|---|
| Stream decode + demux | ~50ms |
| Face detection | ~20ms |
| Video model inference | ~80–150ms |
| Audio feature extraction | ~30ms |
| Audio model inference | ~50–100ms |
| AV sync check | ~50ms |
| Fusion + decision | ~5ms |
| **Total end-to-end** | **< 500ms** |

> Use ONNX Runtime + TensorRT to keep inference under 100ms per model.

---

## 10. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–2)
- [ ] Set up Python env, PyTorch, CUDA 12
- [ ] FFmpeg stream decoder (RTMP → frames + PCM)
- [ ] Face detection with InsightFace or YOLOv8-face
- [ ] Load pretrained SBI video model → test on FaceForensics++ clips
- [ ] Load AASIST audio model → test on ASVspoof 2019 samples

### Phase 2 — Core Pipeline (Weeks 3–4)
- [ ] Connect video branch end-to-end (stream → face → score)
- [ ] Connect audio branch end-to-end
- [ ] Implement sliding temporal window for continuity
- [ ] Implement SyncNet AV consistency checker
- [ ] Build fusion scoring module

### Phase 3 — Serving & API (Week 5)
- [ ] Wrap pipeline in FastAPI service
- [ ] Add WebSocket for real-time score streaming
- [ ] Dockerize the service with GPU support
- [ ] Add Redis for score caching

### Phase 4 — Dashboard (Week 6)
- [ ] React dashboard with live score visualization
- [ ] Alert panel with session logs
- [ ] Video playback with deepfake heatmap overlay

### Phase 5 — Optimization (Weeks 7–8)
- [ ] Convert models to ONNX / TensorRT
- [ ] Profile and reduce latency to < 500ms
- [ ] Add Kafka for multi-stream support
- [ ] Load test and benchmark

### Phase 6 — Hardening (Weeks 9–10)
- [ ] Evaluate on held-out sets (Celeb-DF v2, WildDeepfake)
- [ ] Add model drift monitoring with MLflow
- [ ] Add adversarial robustness tests
- [ ] Document APIs and deploy on Kubernetes

---

## 11. Challenges & Mitigations

| Challenge | Mitigation Strategy |
|---|---|
| **Latency vs accuracy tradeoff** | Sliding window buffering; quantize models to INT8 |
| **Unseen deepfake generalization** | Ensemble models; SBI excels at generalization |
| **Video compression artifacts** | Train/fine-tune on compressed variants from FF++ |
| **Diverse accents in audio** | Use multilingual wav2vec2-xl as base model |
| **Poor network / packet loss** | Robust VAD; graceful degradation fallback |
| **Gaming the detector** | Obfuscate thresholds; randomized probing windows |
| **High false positive rate** | Use "uncertain" buffer zone; human review queue |
| **Privacy concerns** | Process only face crop; don't store raw video |
| **GPU memory constraints** | Batch inference; model sharding across GPUs |
| **Model drift over time** | MLflow registry; monthly re-validation on new data |

---

## 12. Quick-Start Code Snippets

### Stream Decoder (FFmpeg → Frames + Audio)
```python
import subprocess
import numpy as np

def stream_frames(rtmp_url: str, fps: int = 15, width=640, height=480):
    cmd = [
        'ffmpeg', '-i', rtmp_url,
        '-vf', f'fps={fps},scale={width}:{height}',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-loglevel', 'quiet', '-'
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frame_size = width * height * 3
    while True:
        raw = proc.stdout.read(frame_size)
        if not raw:
            break
        frame = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3))
        yield frame
```

### Face Crop with InsightFace
```python
import insightface
import cv2

app = insightface.app.FaceAnalysis(providers=['CUDAExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

def extract_face(frame: np.ndarray, target_size=224):
    faces = app.get(frame)
    if not faces:
        return None
    face = max(faces, key=lambda f: f.det_score)
    x1, y1, x2, y2 = face.bbox.astype(int)
    crop = frame[y1:y2, x1:x2]
    return cv2.resize(crop, (target_size, target_size))
```

### Load AASIST Audio Model
```python
import torch
import yaml

# Clone: https://github.com/clovaai/aasist
from models.AASIST import Model as AASIST

with open('config/AASIST.conf') as f:
    config = yaml.safe_load(f)

model = AASIST(config['model_config'])
model.load_state_dict(torch.load('pretrained/AASIST.pth'))
model.eval().cuda()

def score_audio(waveform_tensor: torch.Tensor) -> float:
    """Returns fake probability: 0.0=real, 1.0=fake"""
    with torch.no_grad():
        _, logit = model(waveform_tensor.cuda())
        return torch.sigmoid(logit).item()
```

### Fusion & Decision
```python
def fuse_scores(
    video_score: float,
    audio_score: float,
    av_sync_score: float,
    w_video=0.40, w_audio=0.35, w_sync=0.25
) -> float:
    # Low AV sync means higher fake probability
    fake_from_sync = 1.0 - av_sync_score
    composite = (
        w_video * video_score +
        w_audio * audio_score +
        w_sync  * fake_from_sync
    )
    return composite

def decide(score: float) -> str:
    if score < 0.35:   return "REAL"
    if score < 0.65:   return "UNCERTAIN"
    if score < 0.85:   return "LIKELY_FAKE"
    return "FAKE"
```

### FastAPI WebSocket Endpoint
```python
from fastapi import FastAPI, WebSocket

app = FastAPI()

@app.websocket("/ws/stream/{stream_id}")
async def stream_detection(websocket: WebSocket, stream_id: str):
    await websocket.accept()
    detector = DeepfakeDetector(stream_id)  # your pipeline class
    async for result in detector.run():
        await websocket.send_json({
            "stream_id":       stream_id,
            "timestamp":       result.timestamp,
            "video_score":     round(result.video_score, 4),
            "audio_score":     round(result.audio_score, 4),
            "av_sync_score":   round(result.av_sync_score, 4),
            "composite_score": round(result.composite, 4),
            "verdict":         result.verdict
        })
```

---

## 📚 Additional Reference Links

| Resource | URL |
|---|---|
| ASVspoof Challenge (official) | https://www.asvspoof.org/ |
| FaceForensics Benchmark | http://kaldir.vc.in.tum.de/faceforensics_benchmark/ |
| DFDC Kaggle Challenge | https://www.kaggle.com/c/deepfake-detection-challenge |
| Papers With Code — Deepfake Detection | https://paperswithcode.com/task/deepfake-detection |
| Papers With Code — Audio Deepfake | https://paperswithcode.com/task/audio-deepfake-detection |
| DeepFake-o-meter (live demo tool) | https://zinc.cse.buffalo.edu/ubmdfl/deep-o-meter/landing_page |
| Deepware Scanner (commercial) | https://scanner.deepware.ai/ |
| HuggingFace Audio Deepfake Models | https://huggingface.co/models?search=deepfake+audio |
| timm (PyTorch Image Models) | https://github.com/huggingface/pytorch-image-models |
| ONNX Runtime | https://onnxruntime.ai/ |
| NVIDIA TensorRT | https://developer.nvidia.com/tensorrt |
| Mediamtx (RTMP/HLS server) | https://github.com/bluenviron/mediamtx |
| MLflow (MLOps) | https://mlflow.org/ |

---

> **Handoff Note**: Start with SBI + AASIST. Clone both repos, run them on a 30-second clip from FaceForensics++ and ASVspoof 2019, verify scores, then build the live stream wrapper around them. That is your fastest path to a working proof-of-concept before investing in the full distributed pipeline.
