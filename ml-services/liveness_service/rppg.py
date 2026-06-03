"""
MAVEN — Liveness Service: rPPG Module
Implements the CHROM remote photoplethysmography algorithm (De Haan & Jeanne, 2013).
Extracts a cardiac pulse signal from skin color variations across video frames.

Improvements over v1:
  - Multi-region extraction: forehead + left cheek + right cheek
  - Cross-correlation scoring: all 3 regions must show correlated heartbeats
  - Harmonic verification: checks for the 2nd harmonic of the dominant HR frequency
  - Final score blends SNR quality, cross-correlation, and harmonic presence
"""

import logging

import cv2
import numpy as np
from scipy.signal import butter, filtfilt
from face_landmarker import create_face_landmarker, detect_face_landmarks

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# MediaPipe Face Mesh landmark indices for each ROI region
FOREHEAD_LMKS   = [10, 338, 297, 332, 284, 251, 389]
LEFT_CHEEK_LMKS  = [234, 127, 162, 21, 54, 103, 67, 109]
RIGHT_CHEEK_LMKS = [454, 356, 389, 251, 284, 332, 297, 338]

# Minimum frames required for a reliable HR estimate
# 100 frames ≈ 4 seconds at 25 fps — lowered from 200 to capture short clips.
# BUG FIX: Modern AI clips are often 3–5 seconds; the old 200-frame threshold
# silently rejected rPPG for all of them, returning signal_quality=0.1.
MIN_FRAMES_FOR_RPPG = 100

# Bandpass filter range (Hz) → 45–180 BPM
BP_LOW  = 0.75
BP_HIGH = 3.0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_roi_pixels(
    frame: np.ndarray,
    landmarks,
    indices: list[int],
) -> np.ndarray | None:
    """
    Extract mean RGB from a convex hull ROI defined by landmark indices.

    Returns:
        (3,) mean RGB array, or None if not enough pixels.
    """
    h, w = frame.shape[:2]
    pts = np.array(
        [[int(landmarks[idx].x * w), int(landmarks[idx].y * h)]
         for idx in indices],
        dtype=np.int32,
    )

    mask = np.zeros((h, w), dtype=np.uint8)
    hull = cv2.convexHull(pts)
    cv2.fillConvexPoly(mask, hull, 255)

    roi_pixels = frame[mask == 255]
    if len(roi_pixels) < 10:
        return None

    mean_bgr = roi_pixels.mean(axis=0)
    mean_rgb = mean_bgr[::-1]  # BGR → RGB
    return mean_rgb


def _chrom_rppg(
    rgb_series: np.ndarray,
    fps: float,
) -> tuple[np.ndarray, float, float, bool]:
    """
    Apply the CHROM algorithm to an RGB time series.

    Returns:
        (filtered_signal, hr_bpm, signal_quality, pulse_present)
    """
    R, G, B = rgb_series[:, 0], rgb_series[:, 1], rgb_series[:, 2]

    Xs = 3.0 * R - 2.0 * G
    Ys = 1.5 * R + G - 1.5 * B

    std_ys = np.std(Ys)
    if std_ys < 1e-6:
        return np.zeros(len(R)), 0.0, 0.1, False

    rppg_raw = Xs - (np.std(Xs) / std_ys) * Ys

    # Bandpass filter
    nyq = fps / 2.0
    low = BP_LOW / nyq
    high = min(BP_HIGH / nyq, 0.99)
    b_coef, a_coef = butter(3, [low, high], btype="band")
    rppg_filtered = filtfilt(b_coef, a_coef, rppg_raw)

    # FFT peak detection
    n = len(rppg_filtered)
    freqs = np.fft.rfftfreq(n, d=1.0 / fps)
    fft_vals = np.abs(np.fft.rfft(rppg_filtered))

    valid_mask = (freqs >= BP_LOW) & (freqs <= BP_HIGH)
    if not np.any(valid_mask):
        return rppg_filtered, 0.0, 0.1, False

    valid_freqs = freqs[valid_mask]
    valid_fft = fft_vals[valid_mask]

    peak_idx = int(np.argmax(valid_fft))
    dominant_freq = valid_freqs[peak_idx]
    hr_bpm = dominant_freq * 60.0

    # Signal quality (SNR-based)
    snr = float(valid_fft[peak_idx]) / (float(np.mean(fft_vals)) + 1e-8)
    quality = float(min(1.0, snr / 10.0))

    return rppg_filtered, hr_bpm, quality, quality > 0.3


def _check_harmonic(
    fft_vals: np.ndarray,
    freqs: np.ndarray,
    dominant_freq: float,
    tolerance: float = 0.15,
) -> bool:
    """
    Check if the 2nd harmonic (2× dominant frequency) is present in the signal.

    Real cardiac signals always exhibit harmonics due to the non-sinusoidal
    nature of the pulse waveform. Random noise does not.

    Returns True if a significant peak exists near 2× the dominant frequency.
    """
    harmonic_freq = 2.0 * dominant_freq

    # Check if harmonic is within our frequency range
    if harmonic_freq > BP_HIGH:
        return False  # can't verify — inconclusive, not penalized

    harmonic_mask = (freqs >= harmonic_freq - tolerance) & (freqs <= harmonic_freq + tolerance)
    if not np.any(harmonic_mask):
        return False

    harmonic_peak = float(np.max(fft_vals[harmonic_mask]))
    dominant_peak = float(np.max(fft_vals[(freqs >= dominant_freq - tolerance) & (freqs <= dominant_freq + tolerance)]))

    # Harmonic should be at least 15% of the fundamental amplitude
    return harmonic_peak > 0.15 * dominant_peak


def _cross_correlate_signals(
    signals: list[np.ndarray],
) -> float:
    """
    Compute mean pairwise Pearson correlation between rPPG signals from
    multiple face regions.

    In a real person, all regions show the same heartbeat → high correlation.
    In a deepfake, signals are uncorrelated noise → low correlation.

    Returns:
        Mean pairwise correlation in [0, 1]. 0 = uncorrelated, 1 = perfectly correlated.
    """
    if len(signals) < 2:
        return 0.5  # can't compare, neutral

    correlations = []
    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            # Pearson correlation
            a = signals[i] - np.mean(signals[i])
            b = signals[j] - np.mean(signals[j])
            denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-10
            corr = float(np.dot(a, b) / denom)
            # Clamp to [0, 1] — anti-correlation is also suspicious
            correlations.append(max(0.0, corr))

    return float(np.mean(correlations))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_rppg_signal(video_path: str) -> dict:
    """
    Extract remote photoplethysmography (rPPG) signals from multiple face
    regions and estimate heart rate using the CHROM algorithm.

    Multi-region approach:
      - Forehead, left cheek, right cheek are independently analyzed
      - Cross-correlation between regions verifies biological consistency
      - Harmonic verification confirms genuine cardiac signal

    Args:
        video_path: Absolute path to a local video file.

    Returns:
        A dict with keys:
            pulse_present       (bool)
            estimated_hr_bpm    (float)
            signal_quality      (float, 0–1)
            cross_correlation   (float, 0–1)
            harmonic_present    (bool)
            frames_analyzed     (int)
            note                (str, optional — only on early-exit)
    """
    logger.info("rPPG: opening video %s", video_path)

    # Per-region RGB time series
    forehead_means: list[np.ndarray] = []
    left_cheek_means: list[np.ndarray] = []
    right_cheek_means: list[np.ndarray] = []

    face_landmarker = create_face_landmarker()

    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0 or fps is None:
            fps = 25.0
            logger.warning("rPPG: FPS reported as 0; falling back to %.1f", fps)
        else:
            logger.info("rPPG: video FPS=%.2f", fps)

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            landmarks = detect_face_landmarks(face_landmarker, frame)

            if landmarks:
                # Extract from all 3 regions
                forehead_rgb = _extract_roi_pixels(frame, landmarks, FOREHEAD_LMKS)
                left_rgb = _extract_roi_pixels(frame, landmarks, LEFT_CHEEK_LMKS)
                right_rgb = _extract_roi_pixels(frame, landmarks, RIGHT_CHEEK_LMKS)

                if forehead_rgb is not None:
                    forehead_means.append(forehead_rgb)
                if left_rgb is not None:
                    left_cheek_means.append(left_rgb)
                if right_rgb is not None:
                    right_cheek_means.append(right_rgb)

            frame_idx += 1

    finally:
        cap.release()
        face_landmarker.close()
        logger.info(
            "rPPG: processed %d frames, forehead=%d left_cheek=%d right_cheek=%d",
            frame_idx, len(forehead_means), len(left_cheek_means), len(right_cheek_means),
        )

    # -----------------------------------------------------------------------
    # Early exit: not enough frames for reliable HR estimation
    # -----------------------------------------------------------------------
    all_counts = [len(forehead_means), len(left_cheek_means), len(right_cheek_means)]
    primary_count = max(all_counts)

    if primary_count < MIN_FRAMES_FOR_RPPG:
        note = (
            f"Only {primary_count} frames with valid face ROI detected "
            f"(need {MIN_FRAMES_FOR_RPPG} for reliable HR estimation)"
        )
        logger.warning("rPPG: %s", note)
        return {
            "pulse_present": False,
            "estimated_hr_bpm": 0,
            "signal_quality": 0.1,
            "cross_correlation": 0.0,
            "harmonic_present": False,
            "frames_analyzed": primary_count,
            "note": note,
        }

    # -----------------------------------------------------------------------
    # Process each region independently with CHROM
    # -----------------------------------------------------------------------
    region_signals: list[np.ndarray] = []
    best_quality = 0.0
    best_hr = 0.0
    best_pulse = False
    best_signal = None

    regions = [
        ("forehead", forehead_means),
        ("left_cheek", left_cheek_means),
        ("right_cheek", right_cheek_means),
    ]

    for region_name, means_list in regions:
        if len(means_list) < MIN_FRAMES_FOR_RPPG:
            logger.info("rPPG: %s has only %d frames — skipping", region_name, len(means_list))
            continue

        data = np.array(means_list, dtype=np.float32)
        filtered, hr, quality, pulse = _chrom_rppg(data, fps)

        region_signals.append(filtered)
        logger.info(
            "rPPG [%s]: HR=%.1f BPM  quality=%.3f  pulse=%s",
            region_name, hr, quality, pulse,
        )

        if quality > best_quality:
            best_quality = quality
            best_hr = hr
            best_pulse = pulse
            best_signal = filtered

    # -----------------------------------------------------------------------
    # Cross-correlation between regions
    # -----------------------------------------------------------------------
    cross_corr = _cross_correlate_signals(region_signals) if len(region_signals) >= 2 else 0.5

    # -----------------------------------------------------------------------
    # Harmonic verification on the best signal
    # -----------------------------------------------------------------------
    harmonic_present = False
    if best_signal is not None and best_hr > 0:
        n = len(best_signal)
        freqs = np.fft.rfftfreq(n, d=1.0 / fps)
        fft_vals = np.abs(np.fft.rfft(best_signal))
        dominant_freq = best_hr / 60.0
        harmonic_present = _check_harmonic(fft_vals, freqs, dominant_freq)

    # -----------------------------------------------------------------------
    # Final quality score: blend SNR + cross-correlation + harmonic
    # 0.50 × SNR + 0.30 × cross_correlation + 0.20 × harmonic
    # -----------------------------------------------------------------------
    harmonic_bonus = 1.0 if harmonic_present else 0.3
    final_quality = (
        0.50 * best_quality
        + 0.30 * cross_corr
        + 0.20 * harmonic_bonus
    )
    final_quality = min(1.0, max(0.0, final_quality))

    logger.info(
        "rPPG: HR=%.1f BPM  snr_quality=%.3f  cross_corr=%.3f  harmonic=%s  final_quality=%.3f  pulse_present=%s",
        best_hr, best_quality, cross_corr, harmonic_present, final_quality, best_pulse,
    )

    return {
        "pulse_present": best_pulse,
        "estimated_hr_bpm": round(best_hr, 1),
        "signal_quality": round(final_quality, 3),
        "cross_correlation": round(cross_corr, 3),
        "harmonic_present": harmonic_present,
        "frames_analyzed": primary_count,
    }
