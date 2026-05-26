"""
MAVEN — Liveness Service
FastAPI microservice for biological liveness detection.
Detects heartbeat via remote photoplethysmography (rPPG) and
natural eye-blink patterns — signals that deepfake models fail to replicate.
Exposes POST /analyze accepting a Supabase signed video URL and returning structured liveness scores.
"""

import logging
import os
import tempfile
from contextlib import asynccontextmanager

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rppg import extract_rppg_signal
from blink_detector import analyze_blinks

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown logging (matches FFT service pattern)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Liveness Service starting up...")
    logger.info("rPPG algorithm: CHROM (De Haan & Jeanne, 2013)")
    logger.info("Blink algorithm: EAR (Soukupova & Cech, 2016)")
    yield
    logger.info("Liveness Service shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MAVEN — Liveness Service",
    description=(
        "Biological liveness detection using remote photoplethysmography (rPPG) "
        "and eye-blink analysis. Detects physiological signals that synthetic "
        "deepfake models are unable to replicate faithfully."
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


class LivenessResult(BaseModel):
    liveness_score: float = Field(..., description="Fused liveness score [0=fake, 1=real]")
    rppg: dict = Field(..., description="rPPG analysis result containing pulse, HR, cross-correlation, and harmonic metrics")
    blink: dict = Field(..., description="Blink analysis result containing rate, IBI, duration, and waveform metrics")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["utility"])
def health_check():
    """Simple liveness probe used by Docker and the Node orchestrator."""
    return {"status": "ok", "service": "liveness-service"}


@app.post("/analyze", response_model=LivenessResult, tags=["analysis"])
async def analyze(req: AnalysisRequest):
    """
    Run biological liveness detection on a video.

    - Downloads the video from the provided signed URL
    - Extracts rPPG heartbeat signal using the CHROM algorithm
    - Detects eye-blink patterns via MediaPipe Face Mesh EAR
    - Fuses scores: 0.55 × rPPG + 0.45 × blink → liveness_score
    - Cleans up the temp file unconditionally in a finally block
    """
    logger.info("Received liveness analysis request: job_id=%s", req.job_id)

    tmp_path = None
    try:
        # ------------------------------------------------------------------
        # 1. Download video from signed URL to a local temp file
        # ------------------------------------------------------------------
        logger.info("Downloading video for job_id=%s ...", req.job_id)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_file:
            tmp_path = tmp_file.name

        with requests.get(req.video_url, stream=True, timeout=60) as response:
            response.raise_for_status()
            with open(tmp_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

        logger.info("Video downloaded to %s for job_id=%s", tmp_path, req.job_id)

        # ------------------------------------------------------------------
        # 2. rPPG analysis
        # ------------------------------------------------------------------
        logger.info("Running rPPG extraction for job_id=%s ...", req.job_id)
        rppg = extract_rppg_signal(tmp_path)
        logger.info(
            "rPPG complete — pulse_present=%s hr=%.1f quality=%.3f job_id=%s",
            rppg.get("pulse_present"),
            rppg.get("estimated_hr_bpm", 0),
            rppg.get("signal_quality", 0),
            req.job_id,
        )

        # ------------------------------------------------------------------
        # 3. Blink detection
        # ------------------------------------------------------------------
        logger.info("Running blink detection for job_id=%s ...", req.job_id)
        blink = analyze_blinks(tmp_path)
        logger.info(
            "Blink complete — count=%d rate=%.2f/min regularity=%.3f ibi=%.3f duration=%.3f waveform=%.3f job_id=%s",
            blink.get("blink_count", 0),
            blink.get("blink_rate_per_min", 0),
            blink.get("regularity_score", 0),
            blink.get("ibi_score", 0),
            blink.get("duration_score", 0),
            blink.get("waveform_score", 0),
            req.job_id,
        )

        # ------------------------------------------------------------------
        # 4. Score fusion: 0.70 × rPPG + 0.30 × blink
        # ------------------------------------------------------------------
        # rPPG signal_quality now incorporates cross-correlation and harmonic
        # verification internally, so it is already a richer composite signal.
        #
        # 0.15 when no pulse detected — absence of a cardiac signal is a strong
        # synthetic indicator; real videos with poor lighting still show weak signal
        rppg_score = rppg["signal_quality"] if rppg["pulse_present"] else 0.15
        blink_score = blink["regularity_score"]
        liveness_score = round(0.70 * rppg_score + 0.30 * blink_score, 4)

        # Floor: if rPPG strongly confirms real (pulse present + high quality),
        # don't let a noisy blink detector drag the score below 0.65.
        # A strong heartbeat is strong evidence the subject is real.
        if rppg["pulse_present"] and rppg["signal_quality"] > 0.8:
            liveness_score = max(liveness_score, 0.65)

        # Boost: if multi-region rPPG cross-correlation is very high,
        # this is extremely strong evidence of a real biological signal.
        cross_corr = rppg.get("cross_correlation", 0.5)
        if rppg["pulse_present"] and cross_corr > 0.75:
            liveness_score = max(liveness_score, 0.70)

        # Clamp to [0.0, 1.0] as a safety net
        liveness_score = max(0.0, min(1.0, liveness_score))

        logger.info(
            "Liveness score=%.4f (rppg_score=%.3f, blink_score=%.3f, cross_corr=%.3f, rppg_floor_applied=%s) job_id=%s",
            liveness_score,
            rppg_score,
            blink_score,
            cross_corr,
            rppg["pulse_present"] and rppg["signal_quality"] > 0.8,
            req.job_id,
        )

        return LivenessResult(
            liveness_score=liveness_score,
            rppg=rppg,
            blink=blink,
        )

    except requests.exceptions.RequestException as exc:
        logger.error("Failed to download video for job_id=%s: %s", req.job_id, exc)
        raise HTTPException(status_code=502, detail=f"Video download failed: {exc}")
    except Exception as exc:
        logger.exception("Unexpected error during liveness analysis for job_id=%s", req.job_id)
        raise HTTPException(status_code=500, detail=f"Internal liveness analysis error: {exc}")
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
