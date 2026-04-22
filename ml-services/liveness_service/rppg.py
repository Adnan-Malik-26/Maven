"""
MAVEN — Liveness Service: rPPG Module
Implements the CHROM remote photoplethysmography algorithm (De Haan & Jeanne, 2013).
Extracts a cardiac pulse signal from forehead skin color variations across video frames.
"""

import logging

import cv2
import mediapipe as mp
import numpy as np
from scipy.signal import butter, filtfilt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# MediaPipe Face Mesh landmark indices for the forehead region
FOREHEAD_LMKS = [10, 338, 297, 332, 284, 251, 389]

# Minimum frames required for a reliable HR estimate
# 200 frames ≈ 8 seconds at 25 fps — sufficient for one full cardiac cycle window
MIN_FRAMES_FOR_RPPG = 200


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_rppg_signal(video_path: str) -> dict:
    """
    Extract a remote photoplethysmography (rPPG) signal from a video file
    and estimate heart rate using the CHROM algorithm.

    Args:
        video_path: Absolute path to a local video file.

    Returns:
        A dict with keys:
            pulse_present       (bool)
            estimated_hr_bpm    (float)
            signal_quality      (float, 0–1)
            frames_analyzed     (int)
            note                (str, optional — only on early-exit)
    """
    logger.info("rPPG: opening video %s", video_path)

    rgb_means: list[np.ndarray] = []

    # -----------------------------------------------------------------------
    # CRITICAL: Instantiate FaceMesh ONCE outside the frame loop.
    # Creating it per-frame causes severe memory leaks and OOM crashes on
    # videos longer than 30 seconds.
    # -----------------------------------------------------------------------
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
    )

    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0 or fps is None:
            fps = 25.0  # safe fallback — never allow division by zero
            logger.warning("rPPG: FPS reported as 0; falling back to %.1f", fps)
        else:
            logger.info("rPPG: video FPS=%.2f", fps)

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = face_mesh.process(rgb)

            if result.multi_face_landmarks:
                landmarks = result.multi_face_landmarks[0].landmark
                h, w = frame.shape[:2]

                # Extract forehead landmark pixel coordinates
                forehead_pts = np.array(
                    [[int(landmarks[idx].x * w), int(landmarks[idx].y * h)]
                     for idx in FOREHEAD_LMKS],
                    dtype=np.int32,
                )

                # Build a binary mask over the convex hull of forehead points
                mask = np.zeros((h, w), dtype=np.uint8)
                hull = cv2.convexHull(forehead_pts)
                cv2.fillConvexPoly(mask, hull, 255)

                # Extract ROI pixels
                roi_pixels = frame[mask == 255]  # shape: (N, 3) BGR

                if len(roi_pixels) > 10:
                    # Convert BGR → RGB mean and store
                    mean_bgr = roi_pixels.mean(axis=0)
                    mean_rgb = mean_bgr[::-1]  # flip BGR to RGB
                    rgb_means.append(mean_rgb)

            frame_idx += 1

    finally:
        cap.release()
        face_mesh.close()  # free MediaPipe resources unconditionally
        logger.info("rPPG: processed %d frames, %d had valid forehead ROI", frame_idx, len(rgb_means))

    # -----------------------------------------------------------------------
    # Early exit: not enough frames for reliable HR estimation
    # -----------------------------------------------------------------------
    if len(rgb_means) < MIN_FRAMES_FOR_RPPG:
        note = (
            f"Only {len(rgb_means)} frames with valid face ROI detected "
            f"(need {MIN_FRAMES_FOR_RPPG} for reliable HR estimation)"
        )
        logger.warning("rPPG: %s", note)
        return {
            "pulse_present": False,
            "estimated_hr_bpm": 0,
            "signal_quality": 0.1,
            "frames_analyzed": len(rgb_means),
            "note": note,
        }

    # -----------------------------------------------------------------------
    # CHROM algorithm (De Haan & Jeanne, 2013)
    # -----------------------------------------------------------------------
    data = np.array(rgb_means, dtype=np.float32)  # shape: (N, 3) — R, G, B columns
    R, G, B = data[:, 0], data[:, 1], data[:, 2]

    Xs = 3.0 * R - 2.0 * G
    Ys = 1.5 * R + G - 1.5 * B

    std_ys = np.std(Ys)
    if std_ys < 1e-6:
        logger.warning("rPPG: Ys standard deviation near zero — signal degenerate")
        return {
            "pulse_present": False,
            "estimated_hr_bpm": 0,
            "signal_quality": 0.1,
            "frames_analyzed": len(rgb_means),
            "note": "Degenerate Ys channel — uniform skin colour detected",
        }

    rppg_raw = Xs - (np.std(Xs) / std_ys) * Ys

    # -----------------------------------------------------------------------
    # Bandpass filter: 0.75–3.0 Hz  →  45–180 BPM
    # -----------------------------------------------------------------------
    nyq = fps / 2.0
    low = 0.75 / nyq
    high = min(3.0 / nyq, 0.99)  # cap at 0.99 to avoid scipy instability at Nyquist

    b_coef, a_coef = butter(3, [low, high], btype="band")
    rppg_filtered = filtfilt(b_coef, a_coef, rppg_raw)

    # -----------------------------------------------------------------------
    # Dominant frequency via FFT → heart rate
    # -----------------------------------------------------------------------
    n = len(rppg_filtered)
    freqs = np.fft.rfftfreq(n, d=1.0 / fps)
    fft_vals = np.abs(np.fft.rfft(rppg_filtered))

    valid_mask = (freqs >= 0.75) & (freqs <= 3.0)
    if not np.any(valid_mask):
        logger.warning("rPPG: no FFT bins in the 0.75–3.0 Hz physiological range")
        return {
            "pulse_present": False,
            "estimated_hr_bpm": 0,
            "signal_quality": 0.1,
            "frames_analyzed": len(rgb_means),
            "note": "No valid frequency bins in physiological range",
        }

    valid_freqs = freqs[valid_mask]
    valid_fft = fft_vals[valid_mask]

    peak_idx = int(np.argmax(valid_fft))
    dominant_freq = valid_freqs[peak_idx]
    hr_bpm = dominant_freq * 60.0

    # -----------------------------------------------------------------------
    # Signal quality: SNR-based, normalised to [0, 1]
    # -----------------------------------------------------------------------
    snr = float(valid_fft[peak_idx]) / (float(np.mean(fft_vals)) + 1e-8)
    quality = float(min(1.0, snr / 10.0))

    logger.info(
        "rPPG: HR=%.1f BPM  signal_quality=%.3f  pulse_present=%s",
        hr_bpm,
        quality,
        quality > 0.3,
    )

    return {
        "pulse_present": quality > 0.3,
        "estimated_hr_bpm": round(hr_bpm, 1),
        "signal_quality": round(quality, 3),
        "frames_analyzed": len(rgb_means),
    }
