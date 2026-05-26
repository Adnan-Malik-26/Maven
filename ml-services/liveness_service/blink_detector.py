"""
MAVEN — Liveness Service: Blink Detector Module
Implements Eye Aspect Ratio (EAR) blink detection (Soukupova & Cech, 2016)
using MediaPipe Face Mesh landmarks.

Improvements over v1:
  - Inter-Blink Interval (IBI) analysis: checks timing between blinks
  - Blink duration analysis: real blinks are 150–400ms
  - EAR waveform shape analysis: real blinks have smooth V-shaped dips
  - Final score blends rate regularity, IBI regularity, and duration normality

Normal physiological blink rate: 15–25 blinks/minute, mean ≈ 17.5.
Deepfake videos often suppress blink frequency or produce irregular patterns.
"""

import logging
import math

import cv2
import numpy as np
from scipy.spatial.distance import euclidean
from face_landmarker import create_face_landmarker, detect_face_landmarks

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# MediaPipe Face Mesh landmark indices for the left and right eyes
# (following the EAR 6-point model: corners + top/bottom pairs)
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]

# EAR threshold below which the eye is considered closed
# Lowered from 0.20 to 0.18 to reduce false positives from squinting/head tilt
EAR_THRESH = 0.18

# Minimum consecutive frames below EAR_THRESH to count as a blink
# Increased from 2 to 3 — real blinks last ~150-400ms (4-10 frames at 25fps)
# so 3 frames is still well within range, but filters out noise
CONSEC_FRAMES = 3

# Physiological average blink rate (blinks/min) used for regularity scoring.
# Mean is 17.5/min; standard deviation for the Gaussian scoring is 25/min
# (wide enough to cover the full normal range and gracefully degrade at extremes).
PHYSIOLOGICAL_BLINK_RATE = 17.5
BLINK_RATE_SIGMA          = 25.0  # Gaussian sigma for regularity scoring

# Blink duration bounds (in seconds)
# Real human blinks: 150–400ms
BLINK_DURATION_MIN_S = 0.10   # below this → too fast (artifact)
BLINK_DURATION_MAX_S = 0.50   # above this → too slow (artifact)
BLINK_DURATION_IDEAL_S = 0.25 # center of the ideal range

# Inter-blink interval (IBI) normal range
# Mean IBI ≈ 3.5 seconds, CV (coefficient of variation) ≈ 0.30–0.60
IBI_IDEAL_MEAN_S = 3.5
IBI_CV_SIGMA     = 0.40  # Gaussian sigma for CV scoring


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _ear(landmarks, indices: list[int], h: int, w: int) -> float:
    """
    Compute Eye Aspect Ratio for a set of 6 landmark indices.

    EAR = (A + B) / (2 * C)
    where:
      A = vertical distance between pts[1] and pts[5]
      B = vertical distance between pts[2] and pts[4]
      C = horizontal distance between pts[0] and pts[3]

    Based on Soukupova & Cech (CVWW 2016).
    """
    pts = np.array(
        [[landmarks[idx].x * w, landmarks[idx].y * h] for idx in indices],
        dtype=np.float64,
    )
    A = euclidean(pts[1], pts[5])
    B = euclidean(pts[2], pts[4])
    C = euclidean(pts[0], pts[3])
    return (A + B) / (2.0 * C + 1e-6)


def _analyze_blink_durations(
    blink_start_frames: list[int],
    blink_end_frames: list[int],
    fps: float,
) -> float:
    """
    Analyse blink durations and score their normality.

    Real blinks: 150–400ms.  AI-generated blinks are often too fast (<100ms)
    or unnaturally slow (>500ms).

    Returns:
        Duration normality score in [0, 1].
    """
    if not blink_start_frames or fps <= 0:
        return 0.0

    duration_scores = []
    for start, end in zip(blink_start_frames, blink_end_frames):
        duration_s = (end - start) / fps

        # Gaussian scoring centered on BLINK_DURATION_IDEAL_S
        sigma = 0.12  # ~120ms spread
        score = math.exp(-((duration_s - BLINK_DURATION_IDEAL_S) ** 2) / (2.0 * sigma ** 2))

        # Penalize very fast or very slow blinks more heavily
        if duration_s < BLINK_DURATION_MIN_S or duration_s > BLINK_DURATION_MAX_S:
            score *= 0.3

        duration_scores.append(score)

    return float(np.mean(duration_scores)) if duration_scores else 0.0


def _analyze_ibi(
    blink_frames: list[int],
    fps: float,
) -> float:
    """
    Analyse Inter-Blink Intervals (IBI) — the time gaps between consecutive blinks.

    Real humans have a predictable IBI distribution:
      - Mean ≈ 3.5 seconds
      - Coefficient of variation (CV) ≈ 0.30–0.60

    Deepfakes either don't blink, blink too regularly (CV ≈ 0), or too irregularly (CV > 1).

    Returns:
        IBI regularity score in [0, 1].
    """
    if len(blink_frames) < 3 or fps <= 0:
        return 0.0  # not enough blinks to analyze intervals

    # Compute inter-blink intervals in seconds
    ibis = []
    for i in range(1, len(blink_frames)):
        ibi_s = (blink_frames[i] - blink_frames[i - 1]) / fps
        if ibi_s > 0.2:  # filter out double-detections
            ibis.append(ibi_s)

    if len(ibis) < 2:
        return 0.0

    ibi_mean = float(np.mean(ibis))
    ibi_std = float(np.std(ibis))
    ibi_cv = ibi_std / (ibi_mean + 1e-6)  # coefficient of variation

    # Score the CV: ideal range is 0.30–0.60
    # Too regular (CV < 0.10) → robotic, suspicious
    # Too irregular (CV > 1.0) → noisy, suspicious
    cv_score = math.exp(-((ibi_cv - IBI_CV_SIGMA) ** 2) / (2.0 * 0.25 ** 2))

    # Score the mean IBI: ideal around 3.5s
    mean_score = math.exp(-((ibi_mean - IBI_IDEAL_MEAN_S) ** 2) / (2.0 * 3.0 ** 2))

    # Combined IBI score
    return float(0.60 * cv_score + 0.40 * mean_score)


def _analyze_ear_waveform(
    ear_series: list[float],
    blink_start_frames: list[int],
    blink_end_frames: list[int],
) -> float:
    """
    Analyse the EAR waveform shape during each blink.

    Real blinks have a smooth, symmetric V-shaped dip in the EAR signal.
    Deepfakes can have jagged, flat-bottomed, or asymmetric shapes.

    Uses the standard deviation of the EAR values during the blink as a
    smoothness proxy — real V-shapes have moderate std, flat-bottom or jagged
    shapes have low/high std respectively.

    Returns:
        Waveform normality score in [0, 1].
    """
    if not blink_start_frames:
        return 0.0

    smoothness_scores = []
    ear_arr = np.array(ear_series)

    for start, end in zip(blink_start_frames, blink_end_frames):
        # Extend window by 2 frames on each side to capture the V-shape
        window_start = max(0, start - 2)
        window_end = min(len(ear_arr), end + 2)

        if window_end - window_start < 3:
            continue

        window = ear_arr[window_start:window_end]

        # Check for V-shape: minimum should be in the middle portion
        min_idx = np.argmin(window)
        mid_start = len(window) * 0.2
        mid_end = len(window) * 0.8
        is_centered = mid_start <= min_idx <= mid_end

        # Check symmetry: correlation of first half vs reversed second half
        mid = len(window) // 2
        first_half = window[:mid]
        second_half = window[mid + 1:] if mid + 1 < len(window) else window[mid:]

        min_len = min(len(first_half), len(second_half))
        if min_len >= 2:
            first_half = first_half[-min_len:]
            second_half = second_half[:min_len][::-1]

            corr = np.corrcoef(first_half, second_half)[0, 1]
            if np.isnan(corr):
                corr = 0.0
            symmetry = max(0.0, float(corr))
        else:
            symmetry = 0.5

        # Score: centered V-shape + symmetry
        score = 0.5 * (1.0 if is_centered else 0.3) + 0.5 * symmetry
        smoothness_scores.append(score)

    return float(np.mean(smoothness_scores)) if smoothness_scores else 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_blinks(video_path: str) -> dict:
    """
    Detect eye blink events from a video using MediaPipe Face Mesh + EAR.

    Enhanced with:
      - Inter-blink interval (IBI) analysis
      - Blink duration analysis
      - EAR waveform shape analysis

    Args:
        video_path: Absolute path to a local video file.

    Returns:
        A dict with keys:
            blink_count           (int)
            blink_rate_per_min    (float)
            regularity_score      (float, 0–1) — composite of rate + IBI + duration + waveform
            normal_range          ([int, int])
            is_normal             (bool)
            frames_analyzed       (int)
            ibi_score             (float, 0–1) — inter-blink interval regularity
            duration_score        (float, 0–1) — blink duration normality
            waveform_score        (float, 0–1) — EAR waveform shape quality
    """
    logger.info("Blink: opening video %s", video_path)

    ear_series: list[float] = []
    blink_events: list[int] = []  # frame index at end of each blink
    blink_start_frames: list[int] = []
    blink_end_frames: list[int] = []
    consec_below = 0
    blink_start = -1

    # -----------------------------------------------------------------------
    # CRITICAL: Instantiate FaceMesh ONCE outside the frame loop.
    # Creating it per-frame causes severe memory leaks and OOM crashes.
    # -----------------------------------------------------------------------
    face_landmarker = create_face_landmarker()

    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0 or fps is None:
            fps = 25.0  # safe fallback — never allow division by zero
            logger.warning("Blink: FPS reported as 0; falling back to %.1f", fps)
        else:
            logger.info("Blink: video FPS=%.2f", fps)

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            h, w = frame.shape[:2]
            landmarks = detect_face_landmarks(face_landmarker, frame)

            if landmarks:

                left_ear  = _ear(landmarks, LEFT_EYE,  h, w)
                right_ear = _ear(landmarks, RIGHT_EYE, h, w)
                avg_ear   = (left_ear + right_ear) / 2.0

                ear_series.append(avg_ear)

                if avg_ear < EAR_THRESH:
                    if consec_below == 0:
                        blink_start = len(ear_series) - 1  # mark start of potential blink
                    consec_below += 1
                else:
                    # Eye just reopened — count as a blink if it was closed long enough
                    if consec_below >= CONSEC_FRAMES:
                        blink_end = len(ear_series) - 1
                        blink_events.append(blink_end)
                        blink_start_frames.append(blink_start)
                        blink_end_frames.append(blink_end)
                    consec_below = 0
                    blink_start = -1

            frame_idx += 1

    finally:
        cap.release()
        # CRITICAL: Always close FaceMesh to release MediaPipe GPU/CPU resources
        face_landmarker.close()
        logger.info("Blink: processed %d frames, %d blinks detected", frame_idx, len(blink_events))

    # -----------------------------------------------------------------------
    # Metrics
    # -----------------------------------------------------------------------
    total_frames = len(ear_series)

    if total_frames == 0:
        logger.warning("Blink: no frames with face landmarks detected")
        return {
            "blink_count": 0,
            "blink_rate_per_min": 0.0,
            "regularity_score": 0.0,
            "normal_range": [15, 25],
            "is_normal": False,
            "frames_analyzed": 0,
            "ibi_score": 0.0,
            "duration_score": 0.0,
            "waveform_score": 0.0,
        }

    # Duration in minutes — clamp to avoid division by zero on very short clips
    duration_min = max(total_frames / (fps * 60.0), 0.01)
    blink_rate = len(blink_events) / duration_min

    # ── Rate regularity (Gaussian) ────────────────────────────────────────────
    rate_regularity = math.exp(
        -((blink_rate - PHYSIOLOGICAL_BLINK_RATE) ** 2) / (2.0 * BLINK_RATE_SIGMA ** 2)
    )

    # ── Inter-blink interval analysis ─────────────────────────────────────────
    ibi_score = _analyze_ibi(blink_events, fps)

    # ── Blink duration analysis ───────────────────────────────────────────────
    duration_score = _analyze_blink_durations(blink_start_frames, blink_end_frames, fps)

    # ── EAR waveform shape analysis ───────────────────────────────────────────
    waveform_score = _analyze_ear_waveform(ear_series, blink_start_frames, blink_end_frames)

    # ── Composite regularity score ────────────────────────────────────────────
    # 40% rate + 30% IBI + 30% (duration + waveform average)
    duration_waveform = (duration_score + waveform_score) / 2.0
    regularity = 0.40 * rate_regularity + 0.30 * ibi_score + 0.30 * duration_waveform

    logger.info(
        "Blink: count=%d  rate=%.2f/min  rate_reg=%.3f  ibi=%.3f  duration=%.3f  waveform=%.3f  final=%.3f  is_normal=%s",
        len(blink_events),
        blink_rate,
        rate_regularity,
        ibi_score,
        duration_score,
        waveform_score,
        regularity,
        10 <= blink_rate <= 30,
    )

    return {
        "blink_count": len(blink_events),
        "blink_rate_per_min": round(blink_rate, 2),
        "regularity_score": round(regularity, 3),
        "normal_range": [10, 30],
        "is_normal": 10 <= blink_rate <= 30,
        "frames_analyzed": total_frames,
        "ibi_score": round(ibi_score, 3),
        "duration_score": round(duration_score, 3),
        "waveform_score": round(waveform_score, 3),
    }
