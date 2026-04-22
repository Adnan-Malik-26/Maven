"""
MAVEN — LipSync Service
FastAPI microservice for audio-visual lip-sync detection.
Uses the Wav2Lip SyncNet discriminator to detect mismatches between
lip movements and speech phonemes — the strongest signal for dubbing-based
deepfakes and audio-swap attacks.
Exposes POST /analyze accepting a Supabase signed video URL and returning structured sync scores.
"""

import logging
import os
import tempfile
from contextlib import asynccontextmanager

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cross_modal_transformer import analyze_lipsync

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown logging (matches liveness service pattern)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LipSync Service starting up...")
    logger.info("Sync algorithm: Wav2Lip SyncNet discriminator (Prajwal et al., 2020)")
    logger.info("Lip tracking: MediaPipe Face Mesh outer lip landmarks")
    yield
    logger.info("LipSync Service shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MAVEN — LipSync Service",
    description=(
        "Audio-visual lip-sync detection using the Wav2Lip pre-trained SyncNet discriminator. "
        "Detects mismatches between lip movements and speech phonemes — the primary signal "
        "for dubbing-based deepfakes and audio-swap attacks."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AnalysisRequest(BaseModel):
    video_url: str = Field(..., description="Signed URL from Supabase Storage pointing to the video")
    job_id: str = Field(..., description="UUID of the analysis job (used for structured logging)")


class LipSyncResult(BaseModel):
    sync_score: float = Field(..., description="Fused sync score [0=out-of-sync/fake, 1=in-sync/real]")
    verdict: str = Field(..., description="IN_SYNC | UNCERTAIN | OUT_OF_SYNC | INSUFFICIENT_DATA | NO_SPEECH_DETECTED")
    flagged_segments: list[dict] = Field(..., description="List of out-of-sync segments: {start_sec, end_sec, score}")
    windows_analyzed: int = Field(..., description="Total number of 5-frame windows scored by SyncNet")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def download_video(url: str) -> str:
    """Download a remote video URL to a local temp file and return its path."""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(tmp_path, "wb") as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
    return tmp_path


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["utility"])
def health_check():
    """Simple liveness probe used by Docker and the Node orchestrator."""
    return {"status": "ok", "service": "lipsync-service"}


@app.post("/analyze", response_model=LipSyncResult, tags=["analysis"])
async def analyze(req: AnalysisRequest):
    """
    Run audio-visual lip-sync detection on a video.

    - Downloads the video from the provided signed URL
    - Extracts audio MFCCs via ffmpeg + librosa
    - Extracts lip crops per frame via MediaPipe Face Mesh
    - Scores each 5-frame window with the Wav2Lip SyncNet discriminator
    - Returns a fused sync score, verdict, and flagged out-of-sync segments
    - Cleans up the temp file unconditionally in a finally block
    """
    logger.info("Received lipsync analysis request: job_id=%s", req.job_id)

    tmp_path = None
    try:
        # ------------------------------------------------------------------
        # 1. Download video from signed URL to a local temp file
        # ------------------------------------------------------------------
        logger.info("Downloading video for job_id=%s ...", req.job_id)
        tmp_path = download_video(req.video_url)
        logger.info("Video downloaded to %s for job_id=%s", tmp_path, req.job_id)

        # ------------------------------------------------------------------
        # 2. Run lip-sync analysis
        # ------------------------------------------------------------------
        logger.info("Running lipsync analysis for job_id=%s ...", req.job_id)
        result = analyze_lipsync(tmp_path)

        logger.info(
            "LipSync complete — sync_score=%.4f verdict=%s windows=%d job_id=%s",
            result["sync_score"],
            result["verdict"],
            result["windows_analyzed"],
            req.job_id,
        )

        return LipSyncResult(**result)

    except requests.exceptions.RequestException as exc:
        logger.error("Failed to download video for job_id=%s: %s", req.job_id, exc)
        raise HTTPException(status_code=502, detail=f"Video download failed: {exc}")
    except Exception as exc:
        logger.exception("Unexpected error during lipsync analysis for job_id=%s", req.job_id)
        raise HTTPException(status_code=500, detail=f"Internal lipsync analysis error: {exc}")
    finally:
        # ------------------------------------------------------------------
        # Always delete the temp file — never leave files on disk
        # ------------------------------------------------------------------
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
                logger.info("Temp file deleted: %s", tmp_path)
            except OSError as exc:
                logger.warning("Could not delete temp file %s: %s", tmp_path, exc)
