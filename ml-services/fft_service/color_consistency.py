"""
MAVEN — FFT Service: Color Consistency Analyzer

Detects face-background color/lighting mismatches — a hallmark of face-swap
deepfakes where the pasted face has different lighting, white balance, or
color temperature than the original scene.

Algorithm:
  1. Segment the face region using the existing face crop bounding box
  2. Extract a surrounding "background/neck" ring around the face
  3. Convert both regions to LAB color space (perceptually uniform)
  4. Compare color histograms via chi-squared distance
  5. Check for sharp luminance transitions at the face boundary
  6. Combine into a color_mismatch_score [0=consistent, 1=mismatched]

This module requires only OpenCV — no additional dependencies.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# How far outside the face bounding box to sample the "background ring"
RING_EXPANSION = 0.35   # 35% expansion around the face box

# Number of histogram bins per LAB channel
HIST_BINS = 32

# Weights for the final color_mismatch_score
W_HIST_DIST     = 0.40   # histogram distance
W_LUMINANCE_EDGE = 0.35   # boundary luminance transition
W_CHROMA_DIFF   = 0.25   # chrominance (A/B channel) mean shift


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _create_face_and_ring_masks(
    frame_shape: tuple[int, int],
    face_box: tuple[int, int, int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """
    Create binary masks for the face interior and the surrounding ring region.

    Args:
        frame_shape: (height, width) of the frame.
        face_box:    (x, y, w, h) bounding box of the detected face.

    Returns:
        (face_mask, ring_mask) — both uint8 arrays of shape (H, W).
    """
    img_h, img_w = frame_shape
    x, y, w, h = face_box

    # Face ellipse (inscribed in the bounding box for a more natural mask)
    face_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    center = (x + w // 2, y + h // 2)
    axes = (w // 2, h // 2)
    cv2.ellipse(face_mask, center, axes, 0, 0, 360, 255, -1)

    # Expanded ellipse for the ring
    ring_outer = np.zeros((img_h, img_w), dtype=np.uint8)
    exp_w = int(w * (1 + RING_EXPANSION)) // 2
    exp_h = int(h * (1 + RING_EXPANSION)) // 2
    cv2.ellipse(ring_outer, center, (exp_w, exp_h), 0, 0, 360, 255, -1)

    # Ring = expanded minus face interior
    ring_mask = cv2.subtract(ring_outer, face_mask)

    return face_mask, ring_mask


def _histogram_distance(region_a: np.ndarray, region_b: np.ndarray) -> float:
    """
    Compute normalized chi-squared histogram distance between two LAB regions.

    Returns:
        Distance in [0, 1].  0 = identical distributions, 1 = maximally different.
    """
    distances = []
    for channel in range(3):  # L, A, B
        hist_a = cv2.calcHist([region_a], [channel], None, [HIST_BINS], [0, 256])
        hist_b = cv2.calcHist([region_b], [channel], None, [HIST_BINS], [0, 256])

        # Normalize
        cv2.normalize(hist_a, hist_a)
        cv2.normalize(hist_b, hist_b)

        # Chi-squared distance (OpenCV method)
        dist = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CHISQR)
        distances.append(dist)

    # Average across channels, clamp to [0, 1]
    # Empirical range: real faces ≈ 0.01–0.30 (wider on mobile/selfie), deepfakes ≈ 0.40–0.80
    # Widened normalizer from 0.60 to 1.0 to reduce false positives on selfie video
    raw = float(np.mean(distances))
    return float(np.clip(raw / 1.0, 0.0, 1.0))


def _luminance_edge_score(
    lab_frame: np.ndarray,
    face_mask: np.ndarray,
) -> float:
    """
    Measure the sharpness of luminance transitions at the face boundary.

    Face-swap deepfakes often have a visible seam where the pasted face meets
    the original skin/background — manifesting as an abrupt luminance step.

    Returns:
        Edge score in [0, 1].  High = sharp boundary (suspicious).
    """
    L_channel = lab_frame[:, :, 0].astype(np.float64)

    # Compute gradient magnitude of the L channel
    grad_x = cv2.Sobel(L_channel, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(L_channel, cv2.CV_64F, 0, 1, ksize=3)
    gradient = np.sqrt(grad_x ** 2 + grad_y ** 2)

    # Extract the face boundary (dilated - eroded mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    dilated = cv2.dilate(face_mask, kernel, iterations=1)
    eroded = cv2.erode(face_mask, kernel, iterations=1)
    boundary = cv2.subtract(dilated, eroded)

    # Mean gradient at the face boundary
    boundary_pixels = gradient[boundary == 255]
    if len(boundary_pixels) < 10:
        return 0.0

    # Mean gradient across the whole face interior (baseline)
    interior_pixels = gradient[face_mask == 255]
    if len(interior_pixels) < 10:
        return 0.0

    boundary_mean = float(np.mean(boundary_pixels))
    interior_mean = float(np.mean(interior_pixels))

    # Ratio: if the boundary gradient is much higher than interior, it's suspicious
    # Real faces: ratio ≈ 1.0–2.0 (smooth boundary)
    # Deepfakes:  ratio ≈ 2.5–6.0 (sharp seam)
    ratio = boundary_mean / (interior_mean + 1e-6)
    return float(np.clip((ratio - 1.5) / 3.0, 0.0, 1.0))


def _chroma_mean_shift(
    face_lab: np.ndarray,
    ring_lab: np.ndarray,
) -> float:
    """
    Compute the mean chrominance (A, B channels) shift between face and ring.

    A real face blends naturally with its surroundings; a face-swap may have
    a different color cast (too warm, too cool, wrong saturation).

    Returns:
        Chroma shift score in [0, 1].  High = different color cast.
    """
    if face_lab.size == 0 or ring_lab.size == 0:
        return 0.0

    face_a = float(np.mean(face_lab[:, 1]))
    face_b = float(np.mean(face_lab[:, 2]))
    ring_a = float(np.mean(ring_lab[:, 1]))
    ring_b = float(np.mean(ring_lab[:, 2]))

    # Euclidean distance in AB space
    dist = np.sqrt((face_a - ring_a) ** 2 + (face_b - ring_b) ** 2)

    # Empirical range: real ≈ 2–15 (wider on selfie/mobile), deepfake ≈ 18–30
    # Raised offset from 5→10 and range from 20→25 for mobile video tolerance
    return float(np.clip((dist - 10.0) / 25.0, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_color_mismatch_score(
    frame_bgr: np.ndarray,
    face_box: tuple[int, int, int, int] | None = None,
) -> dict:
    """
    Analyse color consistency between a face and its surrounding region.

    Args:
        frame_bgr: Full BGR frame (not cropped — needs face + background).
        face_box:  (x, y, w, h) bounding box of the face.  If None, attempts
                   detection using OpenCV Haar cascade as fallback.

    Returns:
        A dict with:
            color_mismatch_score  float [0=consistent, 1=mismatched/fake]
            histogram_distance    float
            luminance_edge        float
            chroma_shift          float
    """
    h, w = frame_bgr.shape[:2]

    # If no face_box provided, try to detect
    if face_box is None:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(cascade_path)
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
        if len(faces) == 0:
            # BUG FIX: Return neutral 0.5 instead of 0.0 — no face detected means
            # no opinion, not "perfectly consistent (real)".  The old 0.0 biased
            # the final score toward real when face detection failed.
            return {
                "color_mismatch_score": 0.5,
                "histogram_distance": 0.5,
                "luminance_edge": 0.5,
                "chroma_shift": 0.5,
            }
        face_box = tuple(max(faces, key=lambda f: f[2] * f[3]))

    fx, fy, fw, fh = face_box

    # Ensure face box is large enough for meaningful analysis
    if fw < 40 or fh < 40:
        return {
            "color_mismatch_score": 0.0,
            "histogram_distance": 0.0,
            "luminance_edge": 0.0,
            "chroma_shift": 0.0,
        }

    # Convert to LAB
    lab_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)

    # Create masks
    face_mask, ring_mask = _create_face_and_ring_masks((h, w), face_box)

    # Extract pixels
    face_pixels_lab = lab_frame[face_mask == 255]
    ring_pixels_lab = lab_frame[ring_mask == 255]

    if len(face_pixels_lab) < 50 or len(ring_pixels_lab) < 50:
        return {
            "color_mismatch_score": 0.0,
            "histogram_distance": 0.0,
            "luminance_edge": 0.0,
            "chroma_shift": 0.0,
        }

    # Sub-scores
    hist_dist = _histogram_distance(
        lab_frame[face_mask == 255].reshape(-1, 1, 3),
        lab_frame[ring_mask == 255].reshape(-1, 1, 3),
    )
    lum_edge = _luminance_edge_score(lab_frame, face_mask)
    chroma = _chroma_mean_shift(face_pixels_lab, ring_pixels_lab)

    # Final blend
    color_mismatch_score = float(np.clip(
        W_HIST_DIST * hist_dist + W_LUMINANCE_EDGE * lum_edge + W_CHROMA_DIFF * chroma,
        0.0, 1.0,
    ))

    logger.debug(
        "Color: hist=%.4f  lum_edge=%.4f  chroma=%.4f  final=%.4f",
        hist_dist, lum_edge, chroma, color_mismatch_score,
    )

    return {
        "color_mismatch_score": round(color_mismatch_score, 4),
        "histogram_distance": round(hist_dist, 4),
        "luminance_edge": round(lum_edge, 4),
        "chroma_shift": round(chroma, 4),
    }
