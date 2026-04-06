"""
MAVEN — FFT Analyzer
Core frequency-domain analysis logic.

Pipeline per video:
  1. Open video with OpenCV
  2. Sample frames (respecting max_frames + frame_step)
  3. Detect & crop face ROI (optional, falls back to full frame)
  4. Convert to grayscale → 2D FFT via numpy
  5. Compute High-Frequency Ratio (HFR)
  6. Aggregate frame scores → overall artifact score + verdict
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# Optional: import CNN classifier if weights are available
try:
    from models.cnn_classifier import CNNClassifier
    _CNN_AVAILABLE = True
except ImportError:
    _CNN_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# HFR threshold above which a frame is considered "suspicious"
HFR_SUSPICIOUS_THRESHOLD = 0.55

# Verdict thresholds (on the final weighted artifact_score)
VERDICT_FAKE_THRESHOLD      = 0.65
VERDICT_UNCERTAIN_THRESHOLD = 0.40

# CNN weight relative to HFR in the final score (only active when CNN is loaded)
CNN_BLEND_WEIGHT = 0.35   # 35% CNN, 65% HFR
HFR_BLEND_WEIGHT = 0.65

# Maximum suspicious frames returned in the payload
MAX_SUSPICIOUS_PAYLOAD = 50

# Face detection: Haar cascade path bundled with OpenCV
_HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_face_cascade: Optional[cv2.CascadeClassifier] = None
_cnn_model: Optional[object] = None


def _get_face_cascade() -> cv2.CascadeClassifier:
    """Lazy-load the Haar cascade for face detection."""
    global _face_cascade
    if _face_cascade is None:
        _face_cascade = cv2.CascadeClassifier(_HAAR_CASCADE_PATH)
        if _face_cascade.empty():
            logger.warning("Haar cascade failed to load — falling back to full-frame analysis")
            _face_cascade = None
    return _face_cascade


def _get_cnn_model() -> Optional[object]:
    """Lazy-load CNN classifier if available."""
    global _cnn_model
    if _cnn_model is None and _CNN_AVAILABLE:
        weights_path = os.environ.get("MODEL_WEIGHTS_PATH", "./weights/cnn_classifier.pt")
        try:
            _cnn_model = CNNClassifier.load(weights_path)
            logger.info("CNN classifier loaded from %s", weights_path)
        except Exception as exc:
            logger.warning("CNN classifier load failed (%s) — using HFR-only mode", exc)
    return _cnn_model


# ---------------------------------------------------------------------------
# FFT helpers
# ---------------------------------------------------------------------------

def _compute_hfr(gray_frame: np.ndarray) -> tuple[float, np.ndarray]:
    """
    Compute the High-Frequency Ratio (HFR) for a single grayscale frame.

    The HFR measures how much of the total energy in the frequency domain
    lies *outside* the central low-frequency region.  GAN/diffusion models
    tend to produce anomalous high-frequency energy invisible to the naked eye.

    Returns:
        hfr    : float in [0, 1] — higher = more high-frequency content
        magnitude : 2D log-scaled magnitude spectrum (for visualisation)
    """
    # 2D Discrete Fourier Transform
    f        = np.fft.fft2(gray_frame.astype(np.float32))
    fshift   = np.fft.fftshift(f)                        # centre zero-freq component
    magnitude = np.log1p(np.abs(fshift))                 # log scale for dynamic range

    h, w = magnitude.shape

    # Central mask covers the low-frequency quadrant (inner 50% of each dim)
    center_mask = np.zeros((h, w), dtype=np.float32)
    center_mask[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4] = 1.0

    low_energy   = float(np.sum(magnitude * center_mask))
    total_energy = float(np.sum(magnitude))

    # HFR = 1 - fraction_of_energy_in_low_band
    hfr = 1.0 - (low_energy / (total_energy + 1e-8))
    return hfr, magnitude


def _crop_face_roi(frame: np.ndarray, padding: float = 0.15) -> np.ndarray:
    """
    Detect the largest front-facing face in the frame and return a padded crop.

    Falls back to the full frame if no face is detected.

    Args:
        frame   : BGR image (H × W × 3)
        padding : fractional padding around the detected face bounding box
    """
    cascade = _get_face_cascade()
    if cascade is None:
        return frame

    gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray  = cv2.equalizeHist(gray)
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(60, 60),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    if not len(faces):
        return frame

    # Take the largest face by area
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])

    # Add padding
    img_h, img_w = frame.shape[:2]
    pad_x = int(w * padding)
    pad_y = int(h * padding)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)

    return frame[y1:y2, x1:x2]


# ---------------------------------------------------------------------------
# Temporal consistency check
# ---------------------------------------------------------------------------

def _temporal_consistency_factor(frame_scores: list[float]) -> float:
    """
    Measure how consistent the HFR is over time.

    A real video can have naturally higher OR lower HFR — the important signal
    is *erratic* fluctuations across frames, which are common in GAN outputs
    where per-frame generation is not temporally anchored.

    Returns a multiplier in [0.9, 1.1] that slightly amplifies or dampens
    the base HFR score based on temporal variance.
    """
    if len(frame_scores) < 2:
        return 1.0

    arr = np.array(frame_scores, dtype=np.float32)
    variance = float(np.var(arr))

    # High variance → erratic generation → nudge score up slightly
    # Low variance  → temporally stable → nudge score down slightly
    # Clamp effect to ±10%
    factor = 1.0 + np.clip(variance * 2.0 - 0.05, -0.10, 0.10)
    return float(factor)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_fft_analysis(
    video_path: str,
    max_frames: int = 120,
    frame_step: int = 1,
) -> dict:
    """
    Full FFT analysis pipeline for a video file.

    Args:
        video_path  : Path to the video file on disk
        max_frames  : Cap on number of frames to analyse (perf guard)
        frame_step  : Process every Nth frame (1 = every frame)

    Returns:
        dict containing:
            artifact_score       — overall fake-probability [0=real, 1=fake]
            high_freq_ratio      — mean HFR across frames
            suspicious_frames    — list of frame indices with high HFR
            total_frames_analyzed— count of frames processed
            frame_scores         — per-frame HFR list
            verdict              — "REAL" | "UNCERTAIN" | "FAKE"
    """
    path = Path(video_path)
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"OpenCV could not open video: {video_path}")

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info(
        "Opened video: %s | frames=%d fps=%.1f",
        path.name,
        total_video_frames,
        cap.get(cv2.CAP_PROP_FPS),
    )

    frame_scores:       list[float] = []
    suspicious_frames:  list[int]   = []
    frame_idx         = 0
    frames_analyzed   = 0

    cnn = _get_cnn_model()

    try:
        while cap.isOpened() and frames_analyzed < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Respect frame_step
            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            # --- Face ROI crop ---
            roi = _crop_face_roi(frame)

            # --- Grayscale conversion ---
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

            # Resize to fixed size for consistent FFT comparisons
            gray = cv2.resize(gray, (256, 256), interpolation=cv2.INTER_AREA)

            # --- FFT + HFR ---
            hfr, magnitude_spectrum = _compute_hfr(gray)

            # --- Optional CNN blend ---
            if cnn is not None:
                try:
                    cnn_score = float(cnn.predict_single(magnitude_spectrum))
                    frame_score = HFR_BLEND_WEIGHT * hfr + CNN_BLEND_WEIGHT * cnn_score
                except Exception:
                    frame_score = hfr
            else:
                frame_score = hfr

            frame_scores.append(frame_score)

            if frame_score > HFR_SUSPICIOUS_THRESHOLD:
                suspicious_frames.append(frame_idx)

            frame_idx      += 1
            frames_analyzed += 1

    finally:
        cap.release()

    if frames_analyzed == 0:
        raise ValueError("No frames could be extracted from the video")

    # --- Aggregate ---
    scores_arr   = np.array(frame_scores, dtype=np.float32)
    mean_hfr     = float(np.mean(scores_arr))

    # P75 weighted aggregate: slightly biases toward the worst frames
    p75          = float(np.percentile(scores_arr, 75))
    base_score   = 0.6 * mean_hfr + 0.4 * p75

    # Apply temporal consistency factor
    tc_factor    = _temporal_consistency_factor(frame_scores)
    artifact_score = float(np.clip(base_score * tc_factor, 0.0, 1.0))

    # Verdict
    if artifact_score > VERDICT_FAKE_THRESHOLD:
        verdict = "FAKE"
    elif artifact_score > VERDICT_UNCERTAIN_THRESHOLD:
        verdict = "UNCERTAIN"
    else:
        verdict = "REAL"

    logger.info(
        "FFT complete | frames=%d mean_hfr=%.4f artifact_score=%.4f verdict=%s",
        frames_analyzed,
        mean_hfr,
        artifact_score,
        verdict,
    )

    return {
        "artifact_score":        round(artifact_score, 4),
        "high_freq_ratio":       round(mean_hfr, 4),
        "suspicious_frames":     suspicious_frames[:MAX_SUSPICIOUS_PAYLOAD],
        "total_frames_analyzed": frames_analyzed,
        "frame_scores":          [round(s, 4) for s in frame_scores[:200]],
        "verdict":               verdict,
    }
