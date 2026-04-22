"""
MAVEN — LipSync Service: Audio Processor Module
Handles audio extraction from video files and MFCC feature computation.
Uses ffmpeg for audio demuxing and librosa for feature extraction.
"""

import logging
import os
import subprocess
import tempfile

import librosa
import numpy as np

logger = logging.getLogger(__name__)


def extract_audio_wav(
    video_path: str,
    target_sr: int = 16000,
) -> tuple[np.ndarray, int]:
    """
    Extract the audio track from a video file as a mono WAV at target_sr.

    Uses ffmpeg for demuxing (handles all container formats) and librosa
    for loading. The intermediate WAV file is always deleted in a finally block.

    Args:
        video_path: Absolute path to a local video file.
        target_sr:  Target sample rate in Hz (default 16 kHz for SyncNet).

    Returns:
        (audio_array, sample_rate) — float32 numpy array, int sample rate.
    """
    wav_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav_path = tmp.name

        logger.info("Extracting audio from %s → %s", video_path, wav_path)
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", video_path,
                "-vn",              # no video
                "-ar", str(target_sr),
                "-ac", "1",         # mono
                wav_path,
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )

        audio, sr = librosa.load(wav_path, sr=target_sr, mono=True)
        logger.info(
            "Audio extracted — duration=%.2fs samples=%d sr=%d",
            len(audio) / sr,
            len(audio),
            sr,
        )
        return audio, sr

    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="replace") if exc.stderr else ""
        logger.error("ffmpeg failed: %s", stderr[-500:])  # last 500 chars of stderr
        raise RuntimeError(f"ffmpeg audio extraction failed: {stderr[-200:]}") from exc
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError as exc:
                logger.warning("Could not delete temp wav %s: %s", wav_path, exc)


def compute_mfcc(
    audio: np.ndarray,
    sr: int,
    n_mfcc: int = 40,
    hop_length: int = 160,
) -> np.ndarray:
    """
    Compute Mel-Frequency Cepstral Coefficients from a raw audio array.

    Args:
        audio:      Raw audio signal (float32 numpy array).
        sr:         Sample rate in Hz.
        n_mfcc:     Number of MFCC coefficients (default 40 for SyncNet).
        hop_length: Hop length in samples (default 160 = 10ms at 16kHz).

    Returns:
        MFCC matrix of shape (n_mfcc, T) where T = number of time frames.
    """
    return librosa.feature.mfcc(
        y=audio,
        sr=sr,
        n_mfcc=n_mfcc,
        hop_length=hop_length,
        n_fft=512,
    )


def is_silent(
    audio_segment: np.ndarray,
    threshold: float = 0.01,
) -> bool:
    """
    Return True if the RMS energy of the audio segment is below threshold.

    Used to skip silent windows before running SyncNet inference — penalising
    silence as out-of-sync would inflate fake scores during natural pauses.

    Args:
        audio_segment: 1D numpy array of audio samples.
        threshold:     RMS energy threshold below which segment is silent.

    Returns:
        True if segment is silent, False otherwise.
    """
    if len(audio_segment) == 0:
        return True
    rms = float(np.sqrt(np.mean(audio_segment ** 2)))
    return rms < threshold
