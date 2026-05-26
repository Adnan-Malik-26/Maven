"""
MAVEN — FFT Service: Temporal Consistency Analyzer

Measures frame-to-frame identity coherence using ViT [CLS] token embeddings.

Real videos maintain smooth, physiologically-constrained changes across frames.
Deepfakes exhibit abrupt identity shifts, blending seam flicker, and texture
instability that break temporal coherence — detectable as cosine-similarity
variance spikes in the ViT embedding space.

Algorithm:
  1. Compute cosine similarity between consecutive frame embeddings.
  2. Multi-scale sliding windows (sizes 6, 12, 24) for broad/narrow analysis.
  3. Score each window: mean_similarity − variance_penalty.
  4. Jitter detection: variance of similarity deltas (2nd derivative).
  5. Aggregate: 0.60 × mean_of_all_windows + 0.40 × worst_window_score.
  6. Report the worst (lowest-scoring) window as the explainability signal.

Environment variables:
  TEMPORAL_WINDOW_SIZE    — primary sliding window width in frames (default: 12)
"""

from __future__ import annotations

import logging
import os

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TEMPORAL_WINDOW_SIZE: int = int(os.getenv("TEMPORAL_WINDOW_SIZE", "12"))

# Penalty weight applied to intra-window variance.
# Deepfakes are erratic *within* windows, not just on average.
VARIANCE_PENALTY_WEIGHT: float = 0.30

# Multi-scale window sizes — captures both brief glitches and sustained inconsistencies
MULTI_SCALE_WINDOWS: list[int] = [6, 12, 24]

# Jitter: variance of similarity deltas (2nd derivative).
# High jitter → erratic frame-to-frame changes → fake signal.
JITTER_PENALTY_WEIGHT: float = 0.20


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity clamped to [0, 1].  Anti-correlated → 0.0."""
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.clip(np.dot(a, b) / (na * nb), 0.0, 1.0))


def _score_windows_at_scale(
    frame_sims: list[float],
    frame_indices: list[int],
    window_size: int,
) -> list[dict]:
    """
    Score sliding windows at a single scale.

    Returns a list of {start_frame, end_frame, score} dicts.
    """
    ws = min(window_size, len(frame_sims))
    if ws < 2:
        return []

    window_scores: list[dict] = []
    for i in range(len(frame_sims) - ws + 1):
        window = frame_sims[i: i + ws]
        mean_sim = float(np.mean(window))
        std_sim  = float(np.std(window))

        # Variance penalty: erratic similarity (high std) → fake signal
        score = float(np.clip(mean_sim - VARIANCE_PENALTY_WEIGHT * std_sim, 0.0, 1.0))

        start_frame = int(frame_indices[i])       if frame_indices else i
        end_frame   = int(frame_indices[i + ws])  if (frame_indices and i + ws < len(frame_indices)) else i + ws

        window_scores.append({
            "start_frame": start_frame,
            "end_frame":   end_frame,
            "score":       round(score, 4),
        })

    return window_scores


def _compute_jitter_score(frame_sims: list[float]) -> float:
    """
    Compute jitter: the variance of frame-to-frame similarity *changes* (deltas).

    In a real video, the similarity between consecutive frames changes smoothly
    (low delta variance). In a deepfake, the changes are erratic (high delta variance).

    Returns:
        Jitter penalty in [0, 1].  0 = smooth (real), 1 = erratic (fake).
    """
    if len(frame_sims) < 3:
        return 0.0

    deltas = np.diff(frame_sims)
    delta_variance = float(np.var(deltas))

    # Empirical range:
    #   - Real (studio):     ~0.0001–0.001
    #   - Real (mobile/compressed): ~0.002–0.008 (head movement, scene changes)
    #   - Deepfake:          ~0.010–0.05+
    # Widened from [0.001, 0.03] to [0.005, 0.08] to tolerate mobile video variance
    return float(np.clip((delta_variance - 0.005) / 0.075, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_temporal_consistency(
    embeddings: list[np.ndarray],
    frame_indices: list[int],
    window_size: int = TEMPORAL_WINDOW_SIZE,
) -> dict:
    """
    Compute temporal consistency score from a sequence of per-frame embeddings.

    Uses multi-scale analysis (window sizes 6, 12, 24), jitter detection,
    and worst-window weighting for more accurate deepfake identification.

    Args:
        embeddings:    Per-frame ViT [CLS] embedding vectors (L2-normalised).
        frame_indices: Video frame indices corresponding to each embedding.
                       Used only for explainability (worst_window reporting).
        window_size:   Primary sliding window width in frames.

    Returns:
        A dict with:
            temporal_consistency_score  float [0=inconsistent/fake, 1=consistent/real]
            worst_window               {start_frame, end_frame, score} | None
            window_scores              list[{start_frame, end_frame, score}] (≤50 entries)
            n_frames                   int  — number of embeddings processed
            jitter_score               float — second-derivative jitter [0=smooth, 1=erratic]
    """
    n = len(embeddings)

    if n < 2:
        logger.warning("Temporal: fewer than 2 embeddings — returning neutral 0.5")
        return {
            "temporal_consistency_score": 0.5,
            "worst_window": None,
            "window_scores": [],
            "n_frames": n,
            "jitter_score": 0.0,
        }

    # ── Per-adjacent-frame cosine similarities ───────────────────────────────
    frame_sims: list[float] = []
    for i in range(1, n):
        sim = _cosine_sim(embeddings[i - 1], embeddings[i])
        frame_sims.append(sim)

    # ── Multi-scale sliding-window scoring ────────────────────────────────────
    all_window_scores: list[dict] = []
    per_scale_means: list[float] = []

    for ws in MULTI_SCALE_WINDOWS:
        if ws > len(frame_sims):
            continue
        scale_scores = _score_windows_at_scale(frame_sims, frame_indices, ws)
        all_window_scores.extend(scale_scores)
        if scale_scores:
            per_scale_means.append(float(np.mean([w["score"] for w in scale_scores])))

    # ── Jitter detection (2nd derivative analysis) ────────────────────────────
    jitter = _compute_jitter_score(frame_sims)

    # ── Fallback: no full windows (very few frames) ──────────────────────────
    if not all_window_scores:
        raw = float(np.mean(frame_sims))
        # Apply jitter penalty
        adjusted = float(np.clip(raw - JITTER_PENALTY_WEIGHT * jitter, 0.0, 1.0))
        return {
            "temporal_consistency_score": round(adjusted, 4),
            "worst_window": None,
            "window_scores": [],
            "n_frames": n,
            "jitter_score": round(jitter, 4),
        }

    # ── Aggregate with worst-window weighting ─────────────────────────────────
    # Mean across all scales gives a broad picture; worst window catches
    # the single most suspicious region.
    all_scores_values = [w["score"] for w in all_window_scores]
    mean_score = float(np.mean(all_scores_values))
    worst_window = min(all_window_scores, key=lambda w: w["score"])
    worst_score = worst_window["score"]

    # Weighted aggregate: 60% mean + 40% worst
    # This ensures a single terrible window (clear deepfake region) isn't averaged away.
    raw_temporal = 0.60 * mean_score + 0.40 * worst_score

    # Apply jitter penalty
    temporal_consistency_score = float(np.clip(
        raw_temporal - JITTER_PENALTY_WEIGHT * jitter,
        0.0, 1.0,
    ))

    # Deduplicate window_scores for payload (keep primary window size + worst)
    primary_scores = _score_windows_at_scale(frame_sims, frame_indices, window_size)

    logger.info(
        "Temporal: n=%d frames  adj_sims: mean=%.4f std=%.4f"
        "  jitter=%.4f  temporal_score=%.4f  worst_window=%s",
        n,
        float(np.mean(frame_sims)),
        float(np.std(frame_sims)),
        jitter,
        temporal_consistency_score,
        worst_window,
    )

    return {
        "temporal_consistency_score": round(temporal_consistency_score, 4),
        "worst_window":               worst_window,
        "window_scores":              primary_scores[:50],   # cap payload size
        "n_frames":                   n,
        "jitter_score":               round(jitter, 4),
    }
