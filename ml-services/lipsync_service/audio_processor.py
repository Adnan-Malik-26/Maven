"""
MAVEN — LipSync Service: Audio Processor Module
Handles audio extraction from video files and MFCC feature computation.
Uses ffmpeg for audio demuxing and librosa for feature extraction.
"""

import logging
import os
import shutil
import subprocess
import tempfile

import librosa
import numpy as np

logger = logging.getLogger(__name__)

def _ffmpeg_exe() -> str:
    # 1. Check PATH
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    # 2. Allow override via environment variable (set FFMPEG_PATH in .env)
    env_path = os.environ.get("FFMPEG_PATH", "")
    if env_path and os.path.isfile(env_path):
        return env_path
    raise FileNotFoundError(
        "ffmpeg not found. Add it to PATH or set FFMPEG_PATH=/path/to/ffmpeg.exe in your .env"
    )


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
                _ffmpeg_exe(), "-y",
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
    except (FileNotFoundError, OSError) as exc:
        logger.error("ffmpeg executable not available: %s", exc)
        raise RuntimeError("ffmpeg executable not available") from exc
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError as exc:
                logger.warning("Could not delete temp wav %s: %s", wav_path, exc)


def compute_melspectrogram(
    audio: np.ndarray,
    sr: int,
    n_mels: int = 80,
    hop_length: int = 200,
    n_fft: int = 800,
    fmin: float = 55.0,
    fmax: float = 7600.0,
) -> np.ndarray:
    """
    Compute a normalized mel spectrogram matching the Wav2Lip SyncNet training
    distribution (Prajwal et al., 2020 — hparams: n_mels=80, hop=200, fft=800).

    The lipsync_expert.pth weights were trained on mel spectrograms, NOT MFCCs.
    Feeding MFCCs produces near-zero cosine similarities (sync score ≈ 0.5 always).

    Returns:
        Mel spectrogram of shape (80, T), normalized to [0, 1].
    """
    mel = librosa.feature.melspectrogram(
        y=audio,
        sr=sr,
        n_mels=n_mels,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=n_fft,
        fmin=fmin,
        fmax=fmax,
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)
    # Normalize to [0, 1] using Wav2Lip's min_level_db = -100
    mel_norm = np.clip((mel_db + 100.0) / 100.0, 0.0, 1.0)
    return mel_norm.astype(np.float32)


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
