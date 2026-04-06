"""
MAVEN — CNN Classifier (stub / future implementation)

This module defines the interface for a CNN-based spectral map classifier.
It is designed to consume 2D log-magnitude FFT spectra and output a
fake-probability score.

Current state: STUB — returns a neutral 0.5 score.
Future state:  Fine-tune on FaceForensics++ FFT signatures as described in the README.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class CNNClassifier:
    """
    Lightweight CNN wrapper for frequency-domain artifact classification.

    Architecture (planned):
        Input  : 256×256 log-magnitude spectrum (single channel)
        Block 1: Conv2D(1→32, 3×3) → BN → ReLU → MaxPool(2)
        Block 2: Conv2D(32→64, 3×3) → BN → ReLU → MaxPool(2)
        Block 3: Conv2D(64→128, 3×3) → BN → ReLU → AdaptiveAvgPool
        Head   : Linear(128→64) → ReLU → Dropout(0.3) → Linear(64→1) → Sigmoid
        Output : fake_probability ∈ [0, 1]

    Training target datasets:
        - FaceForensics++ (spectral map extraction)
        - Celeb-DF v2 (out-of-distribution generalisation)
    """

    def __init__(self, model=None):
        self._model = model
        self._loaded = model is not None

    @classmethod
    def load(cls, weights_path: str) -> "CNNClassifier":
        """
        Load a trained model from a .pt checkpoint.

        Raises:
            FileNotFoundError : if weights_path does not exist
            RuntimeError      : if the checkpoint is incompatible
        """
        path = Path(weights_path)
        if not path.exists():
            raise FileNotFoundError(
                f"CNN weights not found at {weights_path}. "
                "Train the model first or download pre-trained weights."
            )

        try:
            import torch
            from models._architecture import SpectralCNN  # defined when model is trained

            state = torch.load(str(path), map_location="cpu")
            net   = SpectralCNN()
            net.load_state_dict(state)
            net.eval()
            logger.info("CNN classifier loaded: %s", weights_path)
            return cls(model=net)
        except ImportError:
            raise RuntimeError("PyTorch is required to load the CNN classifier.")

    def predict_single(self, magnitude_spectrum: np.ndarray) -> float:
        """
        Predict the fake-probability for a single spectral magnitude map.

        Args:
            magnitude_spectrum : 2D numpy array (H × W), log-scaled magnitude

        Returns:
            fake_probability : float in [0, 1]
        """
        if not self._loaded:
            # Stub behaviour — neutral score
            logger.debug("CNN stub active — returning neutral score 0.5")
            return 0.5

        import torch

        # Normalise to [0, 1]
        spec = magnitude_spectrum.astype(np.float32)
        spec = (spec - spec.min()) / (spec.max() - spec.min() + 1e-8)

        # Shape: (1, 1, H, W)
        tensor = torch.from_numpy(spec).unsqueeze(0).unsqueeze(0)

        with torch.no_grad():
            score = self._model(tensor).item()

        return float(score)
