"""
MAVEN — FFT Service
FastAPI microservice for frequency-domain deepfake analysis.
Exposes POST /analyze accepting a video path (or URL) and returning structured artifact scores.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from analyzer import run_fft_analysis

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — load any heavy resources once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FFT Service starting up...")
    # Future: pre-load CNN classifier weights here
    yield
    logger.info("FFT Service shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MAVEN — FFT Service",
    description=(
        "Frequency-domain deepfake detection using 2D Fast Fourier Transform. "
        "Detects GAN/diffusion high-frequency noise fingerprints invisible to the human eye."
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
    video_path: str = Field(..., description="Absolute local path or URL to the video file")
    max_frames: int = Field(default=120, ge=1, le=1000, description="Maximum frames to sample (performance cap)")
    frame_step: int = Field(default=1, ge=1, description="Analyse every Nth frame")


class FFTResult(BaseModel):
    artifact_score: float = Field(..., description="Overall fake probability score [0=real, 1=fake]")
    high_freq_ratio: float = Field(..., description="Mean high-frequency energy ratio across analysed frames")
    suspicious_frames: list[int] = Field(..., description="Frame indices with HFR above threshold")
    total_frames_analyzed: int = Field(..., description="Total number of frames processed")
    frame_scores: list[float] = Field(..., description="Per-frame HFR scores (capped at 200 for payload size)")
    verdict: str = Field(..., description="Preliminary verdict: REAL | UNCERTAIN | FAKE")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["utility"])
def health_check():
    """Simple liveness probe used by Docker and the Node orchestrator."""
    return {"status": "ok", "service": "fft-service"}


@app.post("/analyze", response_model=FFTResult, tags=["analysis"])
async def analyze(req: AnalysisRequest):
    """
    Run frequency-domain artifact analysis on a video.

    - Extracts frames from the video
    - Computes 2D FFT per frame
    - Measures high-frequency energy ratio (HFR)
    - Returns a fake-probability score and suspicious frame list
    """
    logger.info("Received analysis request: path=%s max_frames=%d", req.video_path, req.max_frames)

    try:
        result = run_fft_analysis(
            video_path=req.video_path,
            max_frames=req.max_frames,
            frame_step=req.frame_step,
        )
    except FileNotFoundError as exc:
        logger.error("Video file not found: %s", exc)
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        logger.error("Analysis error: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected error during FFT analysis")
        raise HTTPException(status_code=500, detail=f"Internal analysis error: {exc}")

    logger.info(
        "Analysis complete — score=%.4f suspicious_frames=%d verdict=%s",
        result["artifact_score"],
        len(result["suspicious_frames"]),
        result["verdict"],
    )
    return result
