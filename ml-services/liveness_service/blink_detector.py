"""
MAVEN — Liveness Service: Blink Detector Module
Implements Eye Aspect Ratio (EAR) blink detection (Soukupova & Cech, 2016)
using MediaPipe Face Mesh landmarks.

Normal physiological blink rate: 15–25 blinks/minute, mean ≈ 17.5.
Deepfake videos often suppress blink frequency or produce irregular patterns.
"""

import logging

import cv2
import mediapipe as mp
import numpy as np
from scipy.spatial.distance import euclidean

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# MediaPipe Face Mesh landmark indices for the left and right eyes
# (following the EAR 6-point model: corners + top/bottom pairs)
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]

# EAR threshold below which the eye is considered closed
EAR_THRESH = 0.20

# Minimum consecutive frames below EAR_THRESH to count as a blink
CONSEC_FRAMES = 2

# Physiological average blink rate (blinks/min) used for regularity scoring
PHYSIOLOGICAL_BLINK_RATE = 17.5


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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_blinks(video_path: str) -> dict:
    """
    Detect eye blink events from a video using MediaPipe Face Mesh + EAR.

    Args:
        video_path: Absolute path to a local video file.

    Returns:
        A dict with keys:
            blink_count           (int)
            blink_rate_per_min    (float)
            regularity_score      (float, 0–1)
            normal_range          ([int, int])
            is_normal             (bool)
            frames_analyzed       (int)
    """
    logger.info("Blink: opening video %s", video_path)

    ear_series: list[float] = []
    blink_events: list[int] = []
    consec_below = 0

    # -----------------------------------------------------------------------
    # CRITICAL: Instantiate FaceMesh ONCE outside the frame loop.
    # Creating it per-frame causes severe memory leaks and OOM crashes.
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
            logger.warning("Blink: FPS reported as 0; falling back to %.1f", fps)
        else:
            logger.info("Blink: video FPS=%.2f", fps)

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = face_mesh.process(rgb)

            if result.multi_face_landmarks:
                landmarks = result.multi_face_landmarks[0].landmark

                left_ear  = _ear(landmarks, LEFT_EYE,  h, w)
                right_ear = _ear(landmarks, RIGHT_EYE, h, w)
                avg_ear   = (left_ear + right_ear) / 2.0

                ear_series.append(avg_ear)

                if avg_ear < EAR_THRESH:
                    consec_below += 1
                else:
                    # Eye just reopened — count as a blink if it was closed long enough
                    if consec_below >= CONSEC_FRAMES:
                        blink_events.append(len(ear_series))
                    consec_below = 0

            frame_idx += 1

    finally:
        cap.release()
        # CRITICAL: Always close FaceMesh to release MediaPipe GPU/CPU resources
        face_mesh.close()
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
        }

    # Duration in minutes — clamp to avoid division by zero on very short clips
    duration_min = max(total_frames / (fps * 60.0), 0.01)
    blink_rate = len(blink_events) / duration_min

    # Regularity score: 1.0 at the physiological mean (17.5/min), 0.0 at extremes
    # Formula: 1 - |rate - 17.5| / 17.5   clamped to [0, 1]
    regularity = max(0.0, 1.0 - abs(blink_rate - PHYSIOLOGICAL_BLINK_RATE) / PHYSIOLOGICAL_BLINK_RATE)

    logger.info(
        "Blink: count=%d  rate=%.2f/min  regularity=%.3f  is_normal=%s",
        len(blink_events),
        blink_rate,
        regularity,
        15 <= blink_rate <= 25,
    )

    return {
        "blink_count": len(blink_events),
        "blink_rate_per_min": round(blink_rate, 2),
        "regularity_score": round(regularity, 3),
        "normal_range": [15, 25],
        "is_normal": 15 <= blink_rate <= 25,
        "frames_analyzed": total_frames,
    }
