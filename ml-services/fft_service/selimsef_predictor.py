"""
DFDC EfficientNet B7 NS predictor — wraps selimsef's Kaggle competition model.

Reference: https://github.com/selimsef/dfdc_deepfake_challenge
Weights:   GitHub releases v0.0.1 (auto-downloaded on first use)

Architecture: EfficientNet B7 Noisy Student → AdaptiveAvgPool2d → Linear(2560, 1)
Preprocessing: isotropic resize to 380×380, ImageNet normalisation
Output: sigmoid(logit) → fake probability [0=real, 1=fake]
"""

from __future__ import annotations

import logging
import os
import urllib.request
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ENCODER_NAME  = "tf_efficientnet_b7_ns"
WEIGHT_FILENAME = "dfdc_efficientnet_b7_ns.pth"
# One of selimsef's 7 competition checkpoints (best single-model performance)
WEIGHT_URL = (
    "https://github.com/selimsef/dfdc_deepfake_challenge/releases/download/0.0.1/"
    "final_111_DeepFakeClassifier_tf_efficientnet_b7_ns_0_36"
)
WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"
WEIGHT_PATH = WEIGHTS_DIR / WEIGHT_FILENAME

INPUT_SIZE = 380
NUM_FRAMES  = 15   # frames sampled per video for DFDC inference

_IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
_IMAGENET_STD  = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)


# ---------------------------------------------------------------------------
# Model definition — must match selimsef's saved checkpoint architecture
# ---------------------------------------------------------------------------

class DeepFakeClassifier(nn.Module):
    """
    EfficientNet B7 NS wrapper identical to selimsef's architecture.

    Key detail: global_pool="" disables timm's internal pooling so that
    self.global_pool (AdaptiveAvgPool2d) handles it — matching the layer
    structure of checkpoints saved with timm 0.4.x.
    """

    def __init__(self, encoder: str = ENCODER_NAME) -> None:
        super().__init__()
        import timm
        self.encoder    = timm.create_model(encoder, pretrained=False, num_classes=0, global_pool="")
        self.global_pool = nn.AdaptiveAvgPool2d(1)
        self.dropout    = nn.Dropout(0.0)
        self.fc         = nn.Linear(self.encoder.num_features, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.encoder(x)                        # (B, C, H, W)
        features = self.global_pool(features)             # (B, C, 1, 1)
        features = features.view(features.size(0), -1)   # (B, C)
        features = self.dropout(features)
        return self.fc(features)                          # (B, 1)


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_dfdc_model: Optional[DeepFakeClassifier] = None
_load_attempted: bool = False   # avoid retrying a failed load every request


def get_dfdc_model() -> Optional[DeepFakeClassifier]:
    """Lazy-load the DFDC EfficientNet model, auto-downloading weights when absent."""
    global _dfdc_model, _load_attempted

    if _dfdc_model is not None:
        return _dfdc_model
    if _load_attempted:
        return None  # already failed once — don't retry

    _load_attempted = True

    # ── Download weights if missing ──────────────────────────────────────────
    if not WEIGHT_PATH.exists():
        WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(
            "Downloading DFDC EfficientNet B7 NS weights (~255 MB) from GitHub releases…"
        )
        try:
            def _progress(block_num, block_size, total_size):
                downloaded = block_num * block_size
                if total_size > 0 and block_num % 500 == 0:
                    pct = min(100, downloaded * 100 / total_size)
                    logger.info("  Download progress: %.0f%%", pct)

            urllib.request.urlretrieve(WEIGHT_URL, WEIGHT_PATH, reporthook=_progress)
            logger.info("Weights saved to %s", WEIGHT_PATH)
        except Exception as exc:
            logger.error("DFDC weight download failed: %s — model disabled.", exc)
            return None

    # ── Load model ───────────────────────────────────────────────────────────
    try:
        model = DeepFakeClassifier()
        checkpoint = torch.load(WEIGHT_PATH, map_location="cpu", weights_only=False)
        state_dict = checkpoint.get("state_dict", checkpoint)

        # Strip DataParallel 'module.' prefix if present
        cleaned = {k.replace("module.", ""): v for k, v in state_dict.items()}
        missing, unexpected = model.load_state_dict(cleaned, strict=False)
        if missing:
            logger.warning("DFDC checkpoint: %d missing keys: %s", len(missing), missing[:5])
        if unexpected:
            logger.warning("DFDC checkpoint: %d unexpected keys: %s", len(unexpected), unexpected[:5])

        model.eval()
        _dfdc_model = model
        logger.info("DFDC EfficientNet B7 NS loaded successfully.")
        return _dfdc_model

    except Exception as exc:
        logger.error("Failed to load DFDC model from %s: %s", WEIGHT_PATH, exc)
        return None


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def _isotropic_resize(img: np.ndarray, size: int) -> np.ndarray:
    """Resize image preserving aspect ratio; pad with zeros to fill size×size."""
    h, w = img.shape[:2]
    scale = size / max(h, w)
    new_h, new_w = max(1, int(h * scale)), max(1, int(w * scale))
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    y_off = (size - new_h) // 2
    x_off = (size - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas


def _preprocess(bgr_img: np.ndarray) -> torch.Tensor:
    """BGR frame → normalised float tensor (3, INPUT_SIZE, INPUT_SIZE)."""
    resized = _isotropic_resize(bgr_img, INPUT_SIZE)
    rgb     = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    tensor  = torch.from_numpy(rgb).float().permute(2, 0, 1) / 255.0  # (3, H, W)
    return (tensor - _IMAGENET_MEAN) / _IMAGENET_STD


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def predict_video(video_path: str, face_crop_fn: Callable) -> float:
    """
    Run the DFDC EfficientNet B7 NS on NUM_FRAMES evenly sampled from the video.

    Args:
        video_path   : Absolute local path to the video.
        face_crop_fn : callable(bgr_frame) → cropped BGR face region.
                       Should fall back to the full frame when no face detected.

    Returns:
        Fake probability in [0, 1]. Returns 0.5 (neutral) if model unavailable.
    """
    model = get_dfdc_model()
    if model is None:
        logger.warning("DFDC model unavailable — skipping DFDC score (neutral 0.5).")
        return 0.5

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 0.5

    total    = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    n_sample = min(NUM_FRAMES, max(1, total))
    indices  = np.linspace(0, max(0, total - 1), n_sample, dtype=int)

    tensors = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if not ret:
            continue
        face = face_crop_fn(frame)
        tensors.append(_preprocess(face))

    cap.release()

    if not tensors:
        return 0.5

    with torch.no_grad():
        batch  = torch.stack(tensors)                          # (N, 3, 380, 380)
        logits = model(batch)                                  # (N, 1)
        probs  = torch.sigmoid(logits).squeeze(-1).cpu().numpy()

    score = float(np.clip(np.mean(probs), 0.0, 1.0))
    logger.info("DFDC score: %.4f (mean over %d frames)", score, len(tensors))
    return score
