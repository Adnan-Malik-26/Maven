"""
MAVEN — FFT Service: Temporal Consistency Analyzer

Measures frame-to-frame identity coherence using ViT [CLS] token embeddings.

Real videos maintain smooth, physiologically-constrained changes across frames.
Deepfakes exhibit abrupt identity shifts, blending seam flicker, and texture
instability that break temporal coherence — detectable as cosine-similarity
variance spikes in the ViT embedding space.

Algorithm:
  1. Compute cosine similarity between consecutive frame embeddings.
  2. Slide a window of TEMPORAL_WINDOW_SIZE frames across the similarity series.
  3. Score each window: mean_similarity − variance_penalty.
  4. Aggregate: mean of all window scores → temporal_consistency_score [0=fake, 1=real].
  5. Report the worst (lowest-scoring) window as the explainability signal.

Environment variables:
  TEMPORAL_WINDOW_SIZE    — sliding window width in frames (default: 12)
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

    Args:
        embeddings:    Per-frame ViT [CLS] embedding vectors (L2-normalised).
        frame_indices: Video frame indices corresponding to each embedding.
                       Used only for explainability (worst_window reporting).
        window_size:   Sliding window width in frames.

    Returns:
        A dict with:
            temporal_consistency_score  float [0=inconsistent/fake, 1=consistent/real]
            worst_window               {start_frame, end_frame, score} | None
            window_scores              list[{start_frame, end_frame, score}] (≤50 entries)
            n_frames                   int  — number of embeddings processed
    """
    n = len(embeddings)

    if n < 2:
        logger.warning("Temporal: fewer than 2 embeddings — returning neutral 0.5")
        return {
            "temporal_consistency_score": 0.5,
            "worst_window": None,
            "window_scores": [],
            "n_frames": n,
        }

    # ── Per-adjacent-frame cosine similarities ───────────────────────────────
    frame_sims: list[float] = []
    for i in range(1, n):
        sim = _cosine_sim(embeddings[i - 1], embeddings[i])
        frame_sims.append(sim)

    # ── Sliding-window scoring ────────────────────────────────────────────────
    ws = min(window_size, len(frame_sims))
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

    # ── Fallback: no full windows (very few frames) ──────────────────────────
    if not window_scores:
        raw = float(np.mean(frame_sims))
        return {
            "temporal_consistency_score": round(raw, 4),
            "worst_window": None,
            "window_scores": [],
            "n_frames": n,
        }

    # ── Aggregate ────────────────────────────────────────────────────────────
    scores = [w["score"] for w in window_scores]
    temporal_consistency_score = float(np.mean(scores))
    worst_window = min(window_scores, key=lambda w: w["score"])

    logger.info(
        "Temporal: n=%d frames  adj_sims: mean=%.4f std=%.4f"
        "  temporal_score=%.4f  worst_window=%s",
        n,
        float(np.mean(frame_sims)),
        float(np.std(frame_sims)),
        temporal_consistency_score,
        worst_window,
    )

    return {
        "temporal_consistency_score": round(temporal_consistency_score, 4),
        "worst_window":               worst_window,
        "window_scores":              window_scores[:50],   # cap payload size
        "n_frames":                   n,
    }
