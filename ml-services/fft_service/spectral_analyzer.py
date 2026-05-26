"""
MAVEN — FFT Service: Spectral Analyzer

Performs real 2D FFT-based frequency-domain analysis on face crops to detect
GAN / diffusion model fingerprints that are invisible to the human eye but
clearly visible in the frequency spectrum.

Deepfake generators leave distinctive patterns:
  - GANs:       spectral peaks at specific frequencies (grid artifacts)
  - Diffusion:  elevated high-frequency energy plateau
  - Face-swap:  asymmetric spectral energy (blending artifacts)

Algorithm:
  1. Compute 2D FFT of the grayscale face crop
  2. Compute log-magnitude spectrum, centered (DC in the middle)
  3. Divide into radial frequency bands (low / mid / high)
  4. High-Frequency Ratio (HFR) = high_energy / total_energy
  5. Spectral peak detection — abnormal spikes above local baseline
  6. Radial symmetry score — GANs produce symmetric artifacts; real images don't
  7. Combine into a single spectral_fake_score [0=real, 1=fake]
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Radial frequency band boundaries (fraction of Nyquist frequency)
LOW_FREQ_CUTOFF = 0.15     # 0 – 15% = low frequency (face structure)
MID_FREQ_CUTOFF = 0.45     # 15 – 45% = mid frequency (texture, edges)
                            # 45 – 100% = high frequency (noise, artifacts)

# Peak detection: a frequency bin is "abnormal" if its magnitude exceeds
# the local radial-band mean by more than PEAK_SIGMA standard deviations.
PEAK_SIGMA = 3.0

# Maximum expected HFR for a natural image (including H.265/HEVC compression noise).
# Mobile compressed video has genuine high-frequency noise from quantization,
# so the threshold must be higher than for uncompressed studio footage.
# Uncompressed: ~0.08.  H.265 compressed: ~0.12-0.18.
NATURAL_HFR_UPPER = 0.18

# Weights for the final spectral_fake_score blend
W_HFR       = 0.40   # high-frequency energy ratio
W_PEAKS     = 0.35   # spectral peak anomaly
W_SYMMETRY  = 0.25   # radial symmetry (GAN fingerprint)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_magnitude_spectrum(gray: np.ndarray) -> np.ndarray:
    """
    Compute the centered log-magnitude spectrum of a grayscale image.

    Returns:
        2D numpy array of shape (H, W), float64, values ≥ 0.
    """
    # Apply a Hanning window to reduce spectral leakage from image edges
    h, w = gray.shape
    win_y = np.hanning(h).reshape(-1, 1)
    win_x = np.hanning(w).reshape(1, -1)
    windowed = gray.astype(np.float64) * (win_y * win_x)

    # 2D FFT → shift DC to center → log magnitude
    fft = np.fft.fft2(windowed)
    fft_shifted = np.fft.fftshift(fft)
    magnitude = np.log1p(np.abs(fft_shifted))

    return magnitude


def _radial_profile(magnitude: np.ndarray, n_bins: int = 64) -> np.ndarray:
    """
    Compute the azimuthally-averaged radial profile of a centered spectrum.

    Returns:
        1D array of length n_bins — mean magnitude at each radial distance.
    """
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2
    max_radius = min(cy, cx)

    # Build a distance map from the center
    y_coords, x_coords = np.ogrid[:h, :w]
    r = np.sqrt((y_coords - cy) ** 2 + (x_coords - cx) ** 2)

    # Bin edges
    bin_edges = np.linspace(0, max_radius, n_bins + 1)
    profile = np.zeros(n_bins, dtype=np.float64)

    for i in range(n_bins):
        mask = (r >= bin_edges[i]) & (r < bin_edges[i + 1])
        if np.any(mask):
            profile[i] = np.mean(magnitude[mask])

    return profile


def _radial_band_mask(shape: tuple[int, int], r_low: float, r_high: float) -> np.ndarray:
    """
    Create a boolean mask for the radial frequency band [r_low, r_high]
    where r is expressed as a fraction of the maximum radius.
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    max_radius = min(cy, cx)

    y_coords, x_coords = np.ogrid[:h, :w]
    r = np.sqrt((y_coords - cy) ** 2 + (x_coords - cx) ** 2) / max_radius

    return (r >= r_low) & (r < r_high)


def _compute_hfr(magnitude: np.ndarray) -> float:
    """
    Compute the High-Frequency Ratio: proportion of total spectral energy
    that resides in the high-frequency band.

    Real images:  HFR ≈ 0.02 – 0.08
    GAN images:   HFR ≈ 0.10 – 0.25
    """
    high_mask = _radial_band_mask(magnitude.shape, MID_FREQ_CUTOFF, 1.0)

    total_energy = np.sum(magnitude ** 2) + 1e-10
    high_energy = np.sum(magnitude[high_mask] ** 2)

    return float(high_energy / total_energy)


def _detect_spectral_peaks(magnitude: np.ndarray, n_bins: int = 64) -> float:
    """
    Detect abnormal spectral peaks — frequency bins where energy is
    significantly above the local baseline.

    Returns:
        Peak anomaly score in [0, 1].  0 = no anomalies, 1 = many strong peaks.
    """
    profile = _radial_profile(magnitude, n_bins)

    if len(profile) < 4:
        return 0.0

    # Only look at mid-to-high frequency bins (skip the DC / low-freq bins)
    start_bin = max(1, int(n_bins * LOW_FREQ_CUTOFF))
    high_profile = profile[start_bin:]

    if len(high_profile) < 3:
        return 0.0

    # Compute rolling baseline using a wide kernel
    kernel_size = max(3, len(high_profile) // 4)
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = np.ones(kernel_size) / kernel_size
    baseline = np.convolve(high_profile, kernel, mode="same")

    residual = high_profile - baseline
    std = np.std(residual) + 1e-10

    # Count bins where residual exceeds PEAK_SIGMA standard deviations
    peak_mask = residual > (PEAK_SIGMA * std)
    peak_ratio = float(np.sum(peak_mask)) / len(high_profile)

    # Also consider peak *magnitude* — stronger peaks are more suspicious
    if np.any(peak_mask):
        peak_strength = float(np.mean(residual[peak_mask])) / (float(np.mean(high_profile)) + 1e-10)
    else:
        peak_strength = 0.0

    return float(np.clip(0.5 * peak_ratio + 0.5 * min(1.0, peak_strength), 0.0, 1.0))


def _compute_symmetry_score(magnitude: np.ndarray) -> float:
    """
    Measure radial symmetry of the spectrum.

    GANs (especially StyleGAN) produce highly symmetric spectral artifacts
    because their upsampling layers apply identical operations across spatial
    dimensions.  Real images have asymmetric spectra due to natural scene content.

    Returns:
        Symmetry score in [0, 1].  High = symmetric (suspicious), Low = natural.
    """
    h, w = magnitude.shape
    cy, cx = h // 2, w // 2

    # Compare quadrants:  top-left vs bottom-right, top-right vs bottom-left
    q_tl = magnitude[:cy, :cx]
    q_br = magnitude[cy:cy + q_tl.shape[0], cx:cx + q_tl.shape[1]]
    q_tr = magnitude[:cy, cx:cx + q_tl.shape[1]]
    q_bl = magnitude[cy:cy + q_tl.shape[0], :cx]

    # Flip for comparison
    q_br_flip = q_br[::-1, ::-1]
    q_bl_flip = q_bl[::-1, :]
    q_tr_flip = q_tr[:, ::-1]

    # Normalized cross-correlation as symmetry measure
    def _ncc(a: np.ndarray, b: np.ndarray) -> float:
        a_flat = a.flatten().astype(np.float64)
        b_flat = b.flatten().astype(np.float64)
        a_norm = a_flat - np.mean(a_flat)
        b_norm = b_flat - np.mean(b_flat)
        denom = (np.linalg.norm(a_norm) * np.linalg.norm(b_norm)) + 1e-10
        return float(np.dot(a_norm, b_norm) / denom)

    sym1 = _ncc(q_tl, q_br_flip)
    sym2 = _ncc(q_tr, q_bl_flip)

    # Average symmetry; clip to [0, 1]
    raw_sym = (sym1 + sym2) / 2.0

    # Real images: symmetry ≈ 0.3–0.6 (moderate, from natural patterns)
    # GAN images:  symmetry ≈ 0.8–0.98 (very high)
    # Map [0.5, 0.95] → [0, 1] to capture the suspicious range
    return float(np.clip((raw_sym - 0.5) / 0.45, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_spectral_fake_score(face_crop_bgr: np.ndarray) -> dict:
    """
    Analyse a face crop in the frequency domain for deepfake artifacts.

    Args:
        face_crop_bgr: BGR face crop (any size, will be resized to 256×256).

    Returns:
        A dict with:
            spectral_fake_score  float [0=real, 1=fake]
            hfr                  float  — high-frequency energy ratio
            peak_score           float  — spectral peak anomaly
            symmetry_score       float  — radial symmetry
    """
    # Resize to consistent dimensions
    resized = cv2.resize(face_crop_bgr, (256, 256), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    # Compute centered log-magnitude spectrum
    magnitude = _compute_magnitude_spectrum(gray)

    # Sub-scores
    hfr = _compute_hfr(magnitude)
    peak_score = _detect_spectral_peaks(magnitude)
    symmetry_score = _compute_symmetry_score(magnitude)

    # Map HFR to a fake-probability via a sigmoid-like curve:
    # Below NATURAL_HFR_UPPER → low score; above → ramps toward 1.0
    # Wider range [0.18, 0.35] for more gradual ramp (reduces false positives on
    # compressed mobile video which naturally has elevated HFR ~0.15-0.20)
    hfr_fake = float(np.clip((hfr - NATURAL_HFR_UPPER) / (0.35 - NATURAL_HFR_UPPER), 0.0, 1.0))

    # Final blend
    spectral_fake_score = float(np.clip(
        W_HFR * hfr_fake + W_PEAKS * peak_score + W_SYMMETRY * symmetry_score,
        0.0, 1.0,
    ))

    logger.debug(
        "Spectral: hfr=%.4f(→%.4f)  peaks=%.4f  symmetry=%.4f  final=%.4f",
        hfr, hfr_fake, peak_score, symmetry_score, spectral_fake_score,
    )

    return {
        "spectral_fake_score": round(spectral_fake_score, 4),
        "hfr": round(hfr, 4),
        "peak_score": round(peak_score, 4),
        "symmetry_score": round(symmetry_score, 4),
    }
