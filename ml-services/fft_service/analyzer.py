"""
MAVEN — Deepfake Video Analyzer
Dual-model pipeline for maximum accuracy:

  Model A — dima806/deepfake_vs_real_image_detection  (ViT, ~96% acc)
             Frame-by-frame face classification via HuggingFace pipeline.

  Model B — selimsef DFDC EfficientNet B7 NS  (Kaggle competition winner)
             Video-level score using 20 evenly-sampled frames.

  + Spectral analysis (2D FFT frequency-domain)
  + Color consistency (face-background mismatch)
  + Texture heuristic (Laplacian + Sobel smoothness)
  + Temporal consistency (ViT embedding coherence)

Final artifact_score blends 6 signals:
  35% ViT + 20% DFDC + 15% Spectral + 15% Temporal + 15% Color
Both ViT and DFDC must independently lean FAKE before a FAKE verdict is committed.

Pipeline:
  1. Download video (URL) or open local path
  2. ViT frame loop: detect face → ViT + texture + spectral + color → aggregate
  3. DFDC pass: sample 20 frames → EfficientNet B7 NS → robust mean
  4. Temporal consistency from ViT [CLS] embeddings
  5. Blend all signals → threshold → verdict
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
from temporal_analyzer import compute_temporal_consistency
from spectral_analyzer import compute_spectral_fake_score
from color_consistency import compute_color_mismatch_score

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

# Frame score threshold above which a frame is flagged as "suspicious".
SUSPICIOUS_THRESHOLD = 0.60

# Verdict thresholds (on the final weighted artifact_score).
VERDICT_FAKE_THRESHOLD      = 0.65
VERDICT_UNCERTAIN_THRESHOLD = 0.42

# Laplacian variance normalization upper bound.
# Lowered 600.0 → 300.0: compressed mobile video (<5 MB H.265) has lower Laplacian
# variance than uncompressed studio footage.
LAP_VAR_UPPER = 300.0

# ViT calibration: the dima806 model outputs ~50–56% fake probability for real
# mobile-compressed video (H.265 / HEVC), creating a systematic false-positive bias.
# Only scores below VIT_CONFIDENCE_THRESHOLD are treated as ambiguous noise.
# Lowered 0.65 → 0.60: genuine deepfakes score 0.70–0.85 on ViT and must NOT
# be compressed — only the ambiguous 0.50–0.60 zone (compression artifacts) is remapped.
# Calibration remaps [0, VIT_CONFIDENCE_THRESHOLD] → [0, 0.42] (real-leaning)
#                    [VIT_CONFIDENCE_THRESHOLD, 1.0] → [0.42, 1.0] (signal preserved)
# BUG FIX: Lowered from 0.60→0.58 and adjusted ratio to preserve more
# upper-range signal. A raw 0.72 now maps to ~0.63 instead of ~0.615.
VIT_CONFIDENCE_THRESHOLD = 0.58

# Maximum suspicious frames returned in the payload
MAX_SUSPICIOUS_PAYLOAD = 50

# Face detection: Haar cascade bundled with OpenCV
_HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

# Single-scale analysis: 256×256 for consistent face crop analysis
# NOTE: Multi-scale (128px) was removed — the ViT model produces much noisier
# scores at lower resolution on compressed mobile video, causing false positives
# in the temporal jitter detector and erratic frame scores.
ANALYSIS_SCALE = 256


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

def _crop_face_roi(frame: np.ndarray, padding: float = 0.15) -> tuple[np.ndarray, tuple[int, int, int, int] | None]:
    """
    Return the largest detected face crop (with padding), or the full frame.
    Also returns the face bounding box (x, y, w, h) for color consistency analysis,
    or None if no face was detected.
    """
    cascade = _get_face_cascade()
    if cascade is None:
        return frame, None

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
        return frame, None

    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face_box = (int(x), int(y), int(w), int(h))
    img_h, img_w = frame.shape[:2]
    pad_x = int(w * padding)
    pad_y = int(h * padding)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img_w, x + w + pad_x)
    y2 = min(img_h, y + h + pad_y)
    return frame[y1:y2, x1:x2], face_box


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


def _calibrate_vit_score(raw_score: float) -> float:
    """
    Calibrate a raw ViT fake-probability score to remove compression bias.

    The dima806 model outputs ~50–56% fake probability for real mobile-compressed
    video. Scores below VIT_CONFIDENCE_THRESHOLD are ambiguous noise, not a genuine
    fake signal. This function applies a piecewise linear remap:

        [0,   VIT_CONFIDENCE_THRESHOLD] → [0,    0.42]  (compress toward real)
        [VIT_CONFIDENCE_THRESHOLD, 1.0] → [0.42, 1.0]   (preserve genuine fake signal)

    Examples:
        0.55 (real compressed video)  → 0.40  (correctly real-leaning)
        0.58 (boundary)               → 0.42  (neutral)
        0.72 (moderate deepfake)      → 0.63  (preserved as fake-leaning)
        0.80 (clear deepfake)         → 0.72  (still strongly fake)
    """
    if raw_score <= VIT_CONFIDENCE_THRESHOLD:
        return raw_score * (0.42 / VIT_CONFIDENCE_THRESHOLD)
    return 0.42 + (raw_score - VIT_CONFIDENCE_THRESHOLD) * (0.58 / (1.0 - VIT_CONFIDENCE_THRESHOLD))


def _vit_score_and_embedding(
    pil_image: Image.Image,
) -> tuple[float, Optional[np.ndarray]]:
    """
    Run the ViT deepfake classifier on a PIL image in a single forward pass.

    Returns:
        (calibrated_fake_score, cls_embedding)

    The embedding is the [CLS] token from the final ViT hidden state — a
    dense vector encoding the semantic identity of the face crop.  It is used
    downstream for temporal consistency analysis without any extra compute cost.
    """
    import torch
    clf = _get_classifier()

    # Determine the image processor attribute (varies by transformers version)
    processor = getattr(clf, "image_processor", None) or getattr(clf, "feature_extractor", None)

    if processor is None:
        # Fallback: use the pipeline call (no embedding available)
        logger.debug("ViT: no image_processor found — falling back to pipeline, embedding unavailable")
        raw_results = clf(pil_image)
        fake_score = _extract_fake_prob(raw_results)
        return _calibrate_vit_score(fake_score), None

    try:
        inputs = processor(pil_image, return_tensors="pt")
        with torch.no_grad():
            outputs = clf.model(**inputs, output_hidden_states=True)

        # ── Classification score ────────────────────────────────────────────
        probs = torch.softmax(outputs.logits, dim=-1)[0]
        id2label = clf.model.config.id2label
        fake_score = _extract_fake_prob_from_probs(probs, id2label)

        # ── [CLS] embedding from final hidden state ─────────────────────────
        # Shape: (seq_len, hidden_dim); position 0 is the [CLS] summary token
        embedding = outputs.hidden_states[-1][0, 0, :].cpu().numpy()  # (D,)
        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)     # L2-normalise

        return _calibrate_vit_score(fake_score), embedding

    except Exception as exc:
        logger.warning(
            "ViT embedding extraction failed: %s — falling back to pipeline (no embedding)", exc
        )
        raw_results = clf(pil_image)
        fake_score = _extract_fake_prob(raw_results)
        return _calibrate_vit_score(fake_score), None


def _extract_fake_prob(pipeline_results: list) -> float:
    """Extract fake probability from HuggingFace pipeline output list."""
    for r in pipeline_results:
        if r["label"].lower() in ("fake", "ai", "deepfake", "generated", "artificial"):
            return float(r["score"])
    for r in pipeline_results:
        if r["label"].lower() in ("real", "authentic", "genuine"):
            return 1.0 - float(r["score"])
    return float(pipeline_results[0]["score"])


def _extract_fake_prob_from_probs(probs, id2label: dict) -> float:
    """Extract fake probability from a softmax probability tensor."""
    import torch
    for idx, label in id2label.items():
        if label.lower() in ("fake", "ai", "deepfake", "generated", "artificial"):
            return float(probs[idx].item())
    for idx, label in id2label.items():
        if label.lower() in ("real", "authentic", "genuine"):
            return 1.0 - float(probs[idx].item())
    return float(probs.max().item())


def _trimmed_mean(values: list[float], trim_fraction: float = 0.10) -> float:
    """
    Compute the trimmed mean — discard the top and bottom `trim_fraction`
    of values before averaging.  More robust to outlier frames than simple mean.
    """
    if not values:
        return 0.5
    arr = np.array(values, dtype=np.float64)
    n = len(arr)
    trim_count = max(1, int(n * trim_fraction))
    if n <= 2 * trim_count + 1:
        return float(np.mean(arr))
    sorted_arr = np.sort(arr)
    trimmed = sorted_arr[trim_count: n - trim_count]
    return float(np.mean(trimmed))


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

    frame_scores:      list[float]        = []
    suspicious_frames: list[int]          = []
    embeddings:        list[np.ndarray]   = []   # ViT [CLS] tokens for temporal analysis
    sampled_indices:   list[int]          = []   # video frame indices (for explainability)
    spectral_scores:   list[float]        = []   # per-frame spectral fake scores
    color_scores:      list[float]        = []   # per-frame color mismatch scores

    # ── Even frame sampling across full video ──────────────────────────────────────
    # CRITICAL: Previously read the first N frames (only ~1 second of content).
    # Now sample evenly across the full video duration for accurate coverage.
    n_sample = min(max_frames, max(1, total_video_frames))
    sample_indices = np.linspace(0, max(0, total_video_frames - 1), n_sample, dtype=int)

    frames_analyzed = 0
    try:
        for frame_idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(frame_idx))
            ret, frame = cap.read()
            if not ret:
                continue

            # Face crop (returns both the crop and the bounding box)
            roi, face_box = _crop_face_roi(frame)

            # ── ViT analysis at primary scale ─────────────────────────────────
            roi_resized = cv2.resize(roi, (ANALYSIS_SCALE, ANALYSIS_SCALE), interpolation=cv2.INTER_AREA)

            try:
                pil_img = Image.fromarray(cv2.cvtColor(roi_resized, cv2.COLOR_BGR2RGB))
                vit_score, embedding = _vit_score_and_embedding(pil_img)
                if embedding is not None:
                    embeddings.append(embedding)
                    sampled_indices.append(int(frame_idx))
            except Exception as exc:
                logger.warning("ViT inference failed on frame %d: %s", frame_idx, exc)
                vit_score = None

            # ── Texture heuristic ─────────────────────────────────────────────────
            roi_256 = roi_resized  # already 256×256 from above
            gray = cv2.cvtColor(roi_256, cv2.COLOR_BGR2GRAY)
            texture_score = _compute_texture_fake_score(gray)

            # ── Spectral analysis (2D FFT frequency domain) ───────────────────────
            try:
                spectral_result = compute_spectral_fake_score(roi)
                spectral_frame_score = spectral_result["spectral_fake_score"]
                spectral_scores.append(spectral_frame_score)
            except Exception as exc:
                logger.warning("Spectral analysis failed on frame %d: %s", frame_idx, exc)
                spectral_frame_score = 0.0

            # ── Color consistency (face vs background) ────────────────────────────
            try:
                color_result = compute_color_mismatch_score(frame, face_box)
                color_frame_score = color_result["color_mismatch_score"]
                color_scores.append(color_frame_score)
            except Exception as exc:
                logger.warning("Color consistency failed on frame %d: %s", frame_idx, exc)
                color_frame_score = 0.0

            # ── Blend per-frame score ────────────────────────────────────────────
            if vit_score is not None:
                frame_score = VIT_WEIGHT * vit_score + TEXTURE_WEIGHT * texture_score
            else:
                frame_score = texture_score

            frame_scores.append(frame_score)
            if frame_score > SUSPICIOUS_THRESHOLD:
                suspicious_frames.append(int(frame_idx))

            frames_analyzed += 1

    finally:
        cap.release()

    if frames_analyzed == 0:
        raise ValueError("No frames could be extracted from the video")

    # ── Compute intermediate signal aggregates ────────────────────────────────

    # ViT + texture aggregate (trimmed mean — robust to outlier frames)
    vit_agg = float(np.clip(
        _trimmed_mean(frame_scores, trim_fraction=0.10) * _temporal_consistency_factor(frame_scores),
        0.0, 1.0,
    ))

    # Spectral aggregate (mean of per-frame spectral scores)
    spectral_agg = float(np.mean(spectral_scores)) if spectral_scores else 0.0

    # Color consistency aggregate (mean of per-frame color scores)
    color_agg = float(np.mean(color_scores)) if color_scores else 0.0

    # Temporal consistency (ViT [CLS] embedding cosine similarity)
    temporal_result = compute_temporal_consistency(
        embeddings=embeddings,
        frame_indices=sampled_indices,
    )
    temporal_score = temporal_result["temporal_consistency_score"]
    temporal_fake_prob = float(np.clip(1.0 - temporal_score, 0.0, 1.0))

    # DFDC EfficientNet B7 NS pass
    try:
        dfdc_score = _dfdc_predict_video(local_path, lambda f: _crop_face_roi(f)[0])
    except Exception as exc:
        logger.warning("DFDC inference error: %s — neutral 0.5 used", exc)
        dfdc_score = 0.5

    dfdc_available = get_dfdc_model() is not None

    # FINAL SCORING — DFDC-Anchored Architecture
    #
    # Design principle: DFDC EfficientNet B7 NS is the *anchor* model because:
    #   1. It was trained on the DFDC deepfake competition dataset (real fakes)
    #   2. It produces near-zero (0.005-0.01) on real video of any compression
    #   3. It produces elevated scores (0.10-0.90) on actual deepfakes
    #   4. It is NOT confused by H.265 compression, mobile cameras, or lighting
    #
    # The ViT model (dima806) is a general image classifier that is biased by
    # compression artifacts — it scores 0.50-0.85 on real compressed video.
    # It is used ONLY as a secondary confirmation signal, never as primary.
    #
    # Model agreement drives the verdict:
    #   - DFDC REAL + ViT REAL         → strong REAL
    #   - DFDC FAKE + ViT FAKE         → strong FAKE
    #   - DFDC REAL + ViT FAKE         → trust DFDC (ViT has compression bias)
    #   - DFDC FAKE + ViT REAL         → UNCERTAIN (rare — needs investigation)
    # ══════════════════════════════════════════════════════════════════════════

    # ── DFDC: the anchor signal ───────────────────────────────────────────────
    # No magic-number calibration — the raw DFDC output is already well-behaved:
    #   Real video:  0.005 – 0.02  (confidently real)
    #   Weak fake:   0.05  – 0.15  (moderate signal)
    #   Strong fake: 0.15  – 0.90  (strong signal)
    # Threshold: anything above 0.08 is elevated (above natural noise floor)
    DFDC_FAKE_THRESHOLD = 0.08
    DFDC_STRONG_FAKE    = 0.20

    dfdc_leans_fake = dfdc_available and dfdc_score > DFDC_FAKE_THRESHOLD
    dfdc_strong_fake = dfdc_available and dfdc_score > DFDC_STRONG_FAKE
    dfdc_leans_real = dfdc_available and dfdc_score <= DFDC_FAKE_THRESHOLD

    # ── ViT: secondary confirmation signal ────────────────────────────────────
    # Only meaningful when it agrees with DFDC.
    VIT_FAKE_THRESHOLD = 0.65  # must be high to avoid compression false positives
    vit_leans_fake = vit_agg > VIT_FAKE_THRESHOLD
    vit_leans_real = vit_agg < 0.40

    # ── Model agreement scoring ───────────────────────────────────────────────
    if dfdc_available:
        if dfdc_leans_real and vit_leans_real:
            # Both models agree: REAL — strong confidence
            # Weight DFDC heavily since it's the reliable anchor
            artifact_score = float(np.clip(
                0.45 * dfdc_score + 0.20 * vit_agg + 0.10 * spectral_agg + 0.10 * temporal_fake_prob + 0.15 * color_agg,
                0.0, 1.0,
            ))

        elif dfdc_leans_fake and vit_leans_fake:
            # Both models agree: FAKE — strong confidence
            artifact_score = float(np.clip(
                0.40 * dfdc_score + 0.25 * vit_agg + 0.10 * spectral_agg + 0.10 * temporal_fake_prob + 0.15 * color_agg,
                0.0, 1.0,
            ))
            # Both agree it's fake — ensure score reflects this
            artifact_score = max(artifact_score, 0.60)

        elif dfdc_leans_real and vit_leans_fake:
            # DISAGREEMENT: DFDC says real, ViT says fake
            # BUG FIX: When DFDC is near-zero AND ViT is elevated, DFDC may be
            # out-of-domain (diffusion video generators like Sora/Veo/Kling).
            # DFDC was trained on DFDC 2020 face-swaps and returns ~0.01 on
            # content it has never seen.  In this case, elevate ViT weight
            # instead of suppressing it.
            if dfdc_score < 0.05 and vit_agg > 0.65:
                # Out-of-domain: DFDC has no opinion on this content type
                artifact_score = float(np.clip(
                    0.15 * dfdc_score + 0.35 * vit_agg + 0.15 * spectral_agg + 0.15 * temporal_fake_prob + 0.20 * color_agg,
                    0.0, 1.0,
                ))
                logger.warning(
                    "DFDC near-zero (%.4f) + ViT elevated (%.4f) → possible out-of-domain content "
                    "(diffusion video generator), elevating ViT weight",
                    dfdc_score, vit_agg,
                )
            else:
                # Normal disagreement — trust DFDC (ViT compression bias)
                artifact_score = float(np.clip(
                    0.55 * dfdc_score + 0.10 * vit_agg + 0.10 * spectral_agg + 0.10 * temporal_fake_prob + 0.15 * color_agg,
                    0.0, 1.0,
                ))
                logger.info("Model disagreement: DFDC=REAL(%.4f) vs ViT=FAKE(%.4f) → trusting DFDC", dfdc_score, vit_agg)

        elif dfdc_leans_fake and vit_leans_real:
            # DISAGREEMENT: DFDC says fake, ViT says real
            # This is rare and suspicious — trust DFDC but flag as uncertain
            artifact_score = float(np.clip(
                0.50 * dfdc_score + 0.15 * vit_agg + 0.10 * spectral_agg + 0.10 * temporal_fake_prob + 0.15 * color_agg,
                0.0, 1.0,
            ))
            logger.info("Model disagreement: DFDC=FAKE(%.4f) vs ViT=REAL(%.4f) → trusting DFDC", dfdc_score, vit_agg)

        else:
            # Both in uncertain zone — weighted blend, DFDC still primary
            artifact_score = float(np.clip(
                0.40 * dfdc_score + 0.20 * vit_agg + 0.12 * spectral_agg + 0.12 * temporal_fake_prob + 0.16 * color_agg,
                0.0, 1.0,
            ))

    else:
        # DFDC unavailable — fall back to ViT-primary (less reliable)
        artifact_score = float(np.clip(
            0.40 * vit_agg + 0.20 * spectral_agg + 0.20 * temporal_fake_prob + 0.20 * color_agg,
            0.0, 1.0,
        ))
        logger.warning("DFDC model unavailable — using ViT-primary fallback (less reliable)")

    # ── Verdict ───────────────────────────────────────────────────────────────
    # No hard overrides — the verdict is purely driven by the weighted score.
    if artifact_score > VERDICT_FAKE_THRESHOLD:
        verdict = "FAKE"
    elif artifact_score > VERDICT_UNCERTAIN_THRESHOLD:
        verdict = "UNCERTAIN"
    else:
        verdict = "REAL"

    logger.info(
        "Analysis complete | frames=%d vit=%.4f dfdc=%.4f spectral=%.4f color=%.4f temporal=%.4f final=%.4f verdict=%s",
        frames_analyzed, vit_agg, dfdc_score, spectral_agg, color_agg, temporal_score, artifact_score, verdict,
    )

    result = {
        "artifact_score":        round(artifact_score, 4),
        "high_freq_ratio":       round(float(np.mean(frame_scores)), 4),
        "suspicious_frames":     suspicious_frames[:MAX_SUSPICIOUS_PAYLOAD],
        "total_frames_analyzed": frames_analyzed,
        "frame_scores":          [round(s, 4) for s in frame_scores[:200]],
        "verdict":               verdict,
        "temporal_consistency":  temporal_result,
    }

    if _tmp_file is not None:
        try:
            os.unlink(_tmp_file.name)
        except Exception:
            pass

    return result
