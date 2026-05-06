"""
MAVEN FFT CNN classifier.

Consumes 256x256 log-magnitude FFT spectra and returns a fake-probability
score. The local bootstrap checkpoint is trained on synthetic frequency
artifacts, so it is a working development baseline rather than a substitute
for FaceForensics++/Celeb-DF fine-tuning.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


class SpectralCNN:
    """Factory for the lightweight spectral CNN architecture."""

    @staticmethod
    def build():
        import torch.nn as nn

        return nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )


class CNNClassifier:
    """
    Wrapper for loading and running the spectral CNN.

    The checkpoint format may be either a raw state_dict or a dict containing
    "state_dict" plus metadata.
    """

    def __init__(self, model=None):
        self._model = model
        self._loaded = model is not None

    @classmethod
    def load(cls, weights_path: str) -> "CNNClassifier":
        path = Path(weights_path)
        if not path.exists():
            raise FileNotFoundError(
                f"CNN weights not found at {weights_path}. "
                "Run fft_service/bootstrap_cnn_weights.py to create the local "
                "synthetic-bootstrap checkpoint, or replace it with a dataset-trained checkpoint."
            )

        try:
            import torch

            checkpoint = torch.load(str(path), map_location="cpu")
            state = checkpoint.get("state_dict", checkpoint)
            net = SpectralCNN.build()
            net.load_state_dict(state)
            net.eval()
            logger.info("CNN classifier loaded: %s", weights_path)
            return cls(model=net)
        except ImportError as exc:
            raise RuntimeError("PyTorch is required to load the CNN classifier.") from exc

    def predict_single(self, magnitude_spectrum: np.ndarray) -> float:
        if not self._loaded:
            logger.debug("CNN inactive; returning neutral score 0.5")
            return 0.5

        import torch

        spec = magnitude_spectrum.astype(np.float32)
        spec = (spec - spec.min()) / (spec.max() - spec.min() + 1e-8)

        tensor = torch.from_numpy(spec).unsqueeze(0).unsqueeze(0)

        with torch.no_grad():
            score = self._model(tensor).item()

        return float(score)
