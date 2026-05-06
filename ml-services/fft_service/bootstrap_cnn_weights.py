"""
Create a local FFT CNN bootstrap checkpoint.

This trains the lightweight spectral CNN on synthetic FFT magnitude maps:
- class 0: mostly low-frequency, smooth spectra
- class 1: spectra with ring/checker/streak high-frequency artifacts

It is intentionally labeled as a synthetic bootstrap. Use it to make the FFT
service run with a real loadable CNN checkpoint during development, then replace
the checkpoint with one fine-tuned on real forensic datasets for production.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from models.cnn_classifier import SpectralCNN


def _coordinate_grid(size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    axis = np.linspace(-1.0, 1.0, size, dtype=np.float32)
    yy, xx = np.meshgrid(axis, axis, indexing="ij")
    rr = np.sqrt(xx * xx + yy * yy)
    return xx, yy, rr


def _sample_spectrum(label: int, size: int, rng: np.random.Generator) -> np.ndarray:
    xx, yy, rr = _coordinate_grid(size)
    sigma = rng.uniform(0.12, 0.26)
    low_band = np.exp(-(rr * rr) / (2.0 * sigma * sigma))
    spectrum = low_band + rng.normal(0.0, 0.025, (size, size)).astype(np.float32)

    if label == 1:
        ring_center = rng.uniform(0.45, 0.82)
        ring_width = rng.uniform(0.015, 0.05)
        ring = np.exp(-((rr - ring_center) ** 2) / (2.0 * ring_width * ring_width))
        fx = rng.integers(18, 46)
        fy = rng.integers(18, 46)
        checker = (np.sin(np.pi * fx * xx) * np.sin(np.pi * fy * yy) + 1.0) * 0.5
        streaks = (np.abs(np.sin(np.pi * rng.integers(8, 24) * xx)) > 0.96).astype(np.float32)
        spectrum += rng.uniform(0.45, 0.9) * ring
        spectrum += rng.uniform(0.18, 0.45) * checker * (rr > 0.35)
        spectrum += rng.uniform(0.08, 0.22) * streaks
    else:
        spectrum += rng.uniform(0.0, 0.08) * np.exp(-((rr - 0.35) ** 2) / 0.08)

    spectrum = np.clip(spectrum, 0.0, None)
    spectrum = np.log1p(spectrum * 8.0)
    spectrum = (spectrum - spectrum.min()) / (spectrum.max() - spectrum.min() + 1e-8)
    return spectrum.astype(np.float32)


def _make_dataset(samples: int, size: int, seed: int) -> tuple[torch.Tensor, torch.Tensor]:
    rng = np.random.default_rng(seed)
    labels = np.array([0, 1] * (samples // 2), dtype=np.float32)
    if samples % 2:
        labels = np.append(labels, 1.0)
    rng.shuffle(labels)

    spectra = np.stack([_sample_spectrum(int(label), size, rng) for label in labels])
    x = torch.from_numpy(spectra).unsqueeze(1)
    y = torch.from_numpy(labels).unsqueeze(1)
    return x, y


def train(output: Path, samples: int, epochs: int, batch_size: int, seed: int) -> dict:
    torch.manual_seed(seed)
    np.random.seed(seed)

    x, y = _make_dataset(samples=samples, size=256, seed=seed)
    model = SpectralCNN.build()
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)

    model.train()
    for _ in range(epochs):
        permutation = torch.randperm(x.size(0))
        for start in range(0, x.size(0), batch_size):
            idx = permutation[start : start + batch_size]
            pred = model(x[idx])
            loss = criterion(pred, y[idx])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

    model.eval()
    with torch.no_grad():
        pred = model(x)
        accuracy = ((pred >= 0.5).float() == y).float().mean().item()
        loss = criterion(pred, y).item()

    output.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "checkpoint_type": "synthetic-bootstrap",
        "description": "Development baseline trained on synthetic spectral artifacts.",
        "samples": samples,
        "epochs": epochs,
        "batch_size": batch_size,
        "seed": seed,
        "training_accuracy": round(float(accuracy), 4),
        "training_loss": round(float(loss), 6),
    }
    torch.save({"state_dict": model.state_dict(), "metadata": metadata}, output)

    metadata_path = output.with_suffix(".json")
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "weights" / "cnn_classifier.pt",
    )
    parser.add_argument("--samples", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    metadata = train(args.output, args.samples, args.epochs, args.batch_size, args.seed)
    print(json.dumps({"output": str(args.output), **metadata}, indent=2))


if __name__ == "__main__":
    main()
