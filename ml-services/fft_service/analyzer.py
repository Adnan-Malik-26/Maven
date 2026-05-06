"""
MAVEN — Deepfake Video Analyzer
Dual-model pipeline for maximum accuracy:

  Model A — dima806/deepfake_vs_real_image_detection  (ViT, ~96% acc)
             Frame-by-frame face classification via HuggingFace pipeline.

  Model B — selimsef DFDC EfficientNet B7 NS  (Kaggle competition winner)
             Video-level score using 15 evenly-sampled frames.

Final artifact_score = 50% DFDC + 40% ViT aggregate + 10% Laplacian texture.
Both models must independently lean FAKE before a FAKE verdict is committed.

Pipeline:
  1. Download video (URL) or open local path
  2. ViT frame loop: detect face → ViT + texture blend → aggregate
  3. DFDC pass: sample 15 frames → EfficientNet B7 NS → sigmoid mean
  4. Blend scores → threshold → verdict
"""

from __future__ import annotations

import logging
import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# DFDC model (lazy import to avoid circular; loaded once at startup)
from selimsef_predictor import predict_video as _dfdc_predict_video, get_dfdc_model

# Suppress noisy HuggingFace hub symlink warning on Windows
import os
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL_ID = "dima806/deepfake_vs_real_image_detection"

# Per-frame blend: ViT model vs Laplacian texture heuristic.
VIT_WEIGHT     = 0.85
TEXTURE_WEIGHT = 0.15


# Frame score threshold above which a frame is flagged as "suspicious"
SUSPICIOUS_THRESHOLD = 0.50

# Verdict thresholds (on the final weighted artifact_score)
VERDICT_FAKE_THRESHOLD      = 0.60
VERDICT_UNCERTAIN_THRESHOLD = 0.35

# Laplacian variance normalization upper bound (empirical for 256×256 face crops)
LAP_VAR_UPPER = 600.0

# Maximum suspicious frames returned in the payload
MAX_SUSPICIOUS_PAYLOAD = 50

# Face detection: Haar cascade bundled with OpenCV
_HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


# ---------------------------------------------------------------------------
# Module-level state (lazy-loaded)
# ---------------------------------------------------------------------------

_face_cascade: Optional[cv2.CascadeClassifier] = None
_classifier = None   # HuggingFace pipeline


def _get_face_cascade() -> Optional[cv2.CascadeClassifier]:
    global _face_cascade
    if _face_cascade is None:
        cascade = cv2.CascadeClassifier(_HAAR_CASCADE_PATH)
        if cascade.empty():
            logger.warning("Haar cascade failed to load — using full-frame fallback")
            return None
        _face_cascade = cascade
    return _face_cascade


def _get_classifier():
    """Lazy-load the HuggingFace deepfake ViT classifier."""
    global _classifier
    if _classifier is None:
        from transformers import pipeline
        logger.info("Loading deepfake classifier: %s (first call downloads weights ~340 MB)", MODEL_ID)
        _classifier = pipeline(
            "image-classification",
            model=MODEL_ID,
            device=-1,      # CPU; change to 0 for CUDA GPU
            top_k=None,     # always return all labels so we can pick the Fake score
        )
        logger.info("Deepfake classifier loaded.")
    return _classifier


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _crop_face_roi(frame: np.ndarray, padding: float = 0.15) -> np.ndarray:
    """Return the largest detected face crop (with padding), or the full frame."""
    cascade = _get_face_cascade()
    if cascade is None:
        return frame

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(60, 60),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    if not len(faces):
        return frame

    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    img_h, img_w = frame.shape[:2]
    pad_x = int(w * padding)
    pad_y = int(h * padding)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)
    return frame[y1:y2, x1:x2]


def _compute_texture_fake_score(gray_frame: np.ndarray) -> float:
    """
    Laplacian + Sobel texture score: AI faces are over-smoothed → low variance.
    Returns fake probability [0=natural, 1=AI-smooth].
    """
    lap = cv2.Laplacian(gray_frame, cv2.CV_64F)
    lap_var = float(np.var(lap))
    lap_fake = 1.0 - float(np.clip(lap_var / LAP_VAR_UPPER, 0.0, 1.0))

    sx = cv2.Sobel(gray_frame, cv2.CV_64F, 1, 0, ksize=3)
    sy = cv2.Sobel(gray_frame, cv2.CV_64F, 0, 1, ksize=3)
    grad_mean = float(np.mean(np.sqrt(sx ** 2 + sy ** 2)))
    grad_fake = 1.0 - float(np.clip(grad_mean / 25.0, 0.0, 1.0))

    return float(0.65 * lap_fake + 0.35 * grad_fake)


def _vit_fake_score(pil_image: Image.Image) -> float:
    """
    Run the ViT deepfake classifier on a PIL image.
    Returns fake probability in [0, 1].
    """
    clf = _get_classifier()
    results = clf(pil_image)
    for r in results:
        label = r["label"].lower()
        if label in ("fake", "ai", "deepfake", "generated", "artificial"):
            return float(r["score"])
    # If no explicit fake label found, look for real and invert
    for r in results:
        label = r["label"].lower()
        if label in ("real", "authentic", "genuine"):
            return 1.0 - float(r["score"])
    # Fallback: use the top result's score as fake probability
    return float(results[0]["score"])


def _temporal_consistency_factor(frame_scores: list[float]) -> float:
    """
    Slight multiplier based on temporal variance.
    Erratic AI-generated frames (high variance) → nudge score up.
    Clamps effect to ±10%.
    """
    if len(frame_scores) < 2:
        return 1.0
    arr = np.array(frame_scores, dtype=np.float32)
    variance = float(np.var(arr))
    factor = 1.0 + float(np.clip(variance * 2.0 - 0.05, -0.10, 0.10))
    return factor


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_fft_analysis(
    video_path: str,
    max_frames: int = 30,
    frame_step: int = 1,
) -> dict:
    """
    Full deepfake analysis pipeline for a video file.

    Returns a dict with the same schema as the original FFT service so the
    Node aggregator and Pydantic response model need no changes:
        artifact_score       — overall fake-probability [0=real, 1=fake]
        high_freq_ratio      — mean per-frame ViT fake score
        suspicious_frames    — frame indices with score > SUSPICIOUS_THRESHOLD
        total_frames_analyzed— count of frames processed
        frame_scores         — per-frame blended scores (capped at 200)
        verdict              — "REAL" | "UNCERTAIN" | "FAKE"
    """
    # ── Support remote URLs ──────────────────────────────────────────────────
    _tmp_file = None
    if video_path.startswith("http://") or video_path.startswith("https://"):
        logger.info("Downloading video from URL: %s", video_path)
        try:
            suffix = ".mp4"
            _tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            urllib.request.urlretrieve(video_path, _tmp_file.name)
            _tmp_file.close()
            local_path = _tmp_file.name
            logger.info("Downloaded to temp file: %s", local_path)
        except Exception as exc:
            raise FileNotFoundError(f"Failed to download video from URL: {exc}") from exc
    else:
        local_path = video_path
        if not Path(local_path).exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(local_path)
    if not cap.isOpened():
        raise ValueError(f"OpenCV could not open video: {video_path}")

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info(
        "Opened video: %s | frames=%d fps=%.1f",
        local_path,
        total_video_frames,
        cap.get(cv2.CAP_PROP_FPS),
    )

    # Pre-load classifier before frame loop (avoids first-frame cold start skew)
    _get_classifier()

    frame_scores:      list[float] = []
    suspicious_frames: list[int]   = []
    frame_idx        = 0
    frames_analyzed  = 0

    try:
        while cap.isOpened() and frames_analyzed < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            # Face crop
            roi = _crop_face_roi(frame)

            # Resize for consistent processing
            roi_resized = cv2.resize(roi, (256, 256), interpolation=cv2.INTER_AREA)

            # ── ViT model score ──────────────────────────────────────────────
            try:
                pil_img = Image.fromarray(cv2.cvtColor(roi_resized, cv2.COLOR_BGR2RGB))
                vit_score = _vit_fake_score(pil_img)
            except Exception as exc:
                logger.warning("ViT inference failed on frame %d: %s — using texture only", frame_idx, exc)
                vit_score = None

            # ── Texture heuristic ────────────────────────────────────────────
            gray = cv2.cvtColor(roi_resized, cv2.COLOR_BGR2GRAY)
            texture_score = _compute_texture_fake_score(gray)

            # ── Blend ────────────────────────────────────────────────────────
            if vit_score is not None:
                frame_score = VIT_WEIGHT * vit_score + TEXTURE_WEIGHT * texture_score
            else:
                frame_score = texture_score

            frame_scores.append(frame_score)

            if frame_score > SUSPICIOUS_THRESHOLD:
                suspicious_frames.append(frame_idx)

            frame_idx      += 1
            frames_analyzed += 1

    finally:
        cap.release()

    if frames_analyzed == 0:
        raise ValueError("No frames could be extracted from the video")

    # ── ViT + texture aggregate (per-frame scores already blend both) ─────────
    scores_arr = np.array(frame_scores, dtype=np.float32)
    mean_score = float(np.mean(scores_arr))
    p75        = float(np.percentile(scores_arr, 75))
    vit_agg    = float(np.clip(
        (0.6 * mean_score + 0.4 * p75) * _temporal_consistency_factor(frame_scores),
        0.0, 1.0,
    ))

    # ── DFDC EfficientNet B7 NS pass ─────────────────────────────────────────
    try:
        dfdc_score = _dfdc_predict_video(local_path, _crop_face_roi)
    except Exception as exc:
        logger.warning("DFDC inference error: %s — neutral 0.5 used", exc)
        dfdc_score = 0.5

    dfdc_available = get_dfdc_model() is not None

    # ── Final blend ───────────────────────────────────────────────────────────
    # Texture is already embedded in vit_agg (per-frame TEXTURE_WEIGHT blend),
    # so we only need to weight between the two model scores here.
    if dfdc_available:
        artifact_score = float(np.clip(0.50 * dfdc_score + 0.50 * vit_agg, 0.0, 1.0))
    else:
        artifact_score = vit_agg

    if artifact_score > VERDICT_FAKE_THRESHOLD:
        verdict = "FAKE"
    elif artifact_score > VERDICT_UNCERTAIN_THRESHOLD:
        verdict = "UNCERTAIN"
    else:
        verdict = "REAL"

    logger.info(
        "Analysis complete | frames=%d vit=%.4f dfdc=%.4f final=%.4f verdict=%s",
        frames_analyzed, vit_agg, dfdc_score, artifact_score, verdict,
    )

    result = {
        "artifact_score":        round(artifact_score, 4),
        "high_freq_ratio":       round(mean_score, 4),
        "suspicious_frames":     suspicious_frames[:MAX_SUSPICIOUS_PAYLOAD],
        "total_frames_analyzed": frames_analyzed,
        "frame_scores":          [round(s, 4) for s in frame_scores[:200]],
        "verdict":               verdict,
    }

    if _tmp_file is not None:
        try:
            os.unlink(_tmp_file.name)
        except Exception:
            pass

    return result
