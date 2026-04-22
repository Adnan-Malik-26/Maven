"""
MAVEN — LipSync Service: Cross-Modal Transformer (SyncNet)
Implements the Wav2Lip SyncNet discriminator for audio-visual lip-sync scoring.
Architecture: Prajwal et al., "A Lip Sync Expert Is All You Need for Speech to Lip Generation
In The Wild" (ACM MM 2020) — https://github.com/Rudrabha/Wav2Lip

The SyncNet discriminator scores whether a 5-frame lip crop window matches the
corresponding audio MFCC slice. A high score (close to 1.0) means in-sync (real);
a low score (close to 0.0) means out-of-sync (deepfake or audio-swap).
"""

import logging
import os
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import torch
import torch.nn as nn
from skimage.transform import resize

from audio_processor import compute_mfcc, extract_audio_wav, is_silent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
WEIGHTS_PATH = Path(os.getenv("MODEL_WEIGHTS_PATH", "./weights")) / "lipsync_expert.pth"

WINDOW_FRAMES      = 5      # frames per SyncNet scoring window
WINDOW_STRIDE      = 1      # dense scoring — every frame
IMG_SIZE           = 88     # lip crop size expected by SyncNet
SILENCE_RMS_THRESH = 0.01   # RMS threshold for silence skip

# MediaPipe outer lip landmark indices (Face Mesh 468-point model)
LIP_OUTER = [
    61, 146, 91, 181, 84, 17, 314, 405,
    321, 375, 291, 308, 324, 318, 402,
    317, 14, 87, 178, 88, 95, 185, 40,
    39, 37, 0, 267, 269, 270, 409,
]


# ---------------------------------------------------------------------------
# SyncNet Architecture
# Exact match to lipsync_expert.pth checkpoint structure.
# DO NOT change layer dimensions or ordering.
# ---------------------------------------------------------------------------

class Conv2d(nn.Module):
    def __init__(self, cin, cout, kernel_size, stride, padding, residual=False):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(cin, cout, kernel_size, stride, padding),
            nn.BatchNorm2d(cout),
        )
        self.act = nn.ReLU()
        self.residual = residual

    def forward(self, x):
        out = self.conv(x)
        return self.act(out + x) if self.residual else self.act(out)


class SyncNet_color(nn.Module):
    """
    Wav2Lip SyncNet color discriminator.
    face_encoder  : (B, 15, H, W) → (B, 512)   [5 RGB frames stacked on channel dim]
    audio_encoder : (B, 1, 80, 16) → (B, 512)  [mel spectrogram / MFCC slice]
    Returns cosine similarity score per sample: (B,)
    """

    def __init__(self):
        super().__init__()

        self.face_encoder = nn.Sequential(
            Conv2d(15, 32, 7, 1, 3),
            Conv2d(32, 64, 5, (1, 2), 2),
            Conv2d(64, 64, 3, 1, 1, residual=True),
            Conv2d(64, 128, 3, 2, 1),
            Conv2d(128, 128, 3, 1, 1, residual=True),
            Conv2d(128, 256, 3, 2, 1),
            Conv2d(256, 256, 3, 1, 1, residual=True),
            Conv2d(256, 512, 3, 2, 1),
            Conv2d(512, 512, 3, 1, 1, residual=True),
            Conv2d(512, 512, 3, 2, 1),
            Conv2d(512, 512, 3, 1, 1, residual=True),
            Conv2d(512, 512, (3, 6), 1, 0),
            nn.Flatten(),
            nn.Linear(512, 512),
        )

        self.audio_encoder = nn.Sequential(
            Conv2d(1, 32, 3, 1, 1),
            Conv2d(32, 32, 3, 1, 1, residual=True),
            Conv2d(32, 64, 3, (3, 1), 1),
            Conv2d(64, 64, 3, 1, 1, residual=True),
            Conv2d(64, 128, 3, 3, 1),
            Conv2d(128, 128, 3, 1, 1, residual=True),
            Conv2d(128, 256, 3, (3, 2), 1),
            Conv2d(256, 256, 3, 1, 1, residual=True),
            Conv2d(256, 512, 3, 1, 0),
            Conv2d(512, 512, 1, 1, 0),
            nn.Flatten(),
            nn.Linear(512, 512),
        )

    def forward(self, audio_seq, face_seq):
        fa = self.audio_encoder(audio_seq)
        fv = self.face_encoder(face_seq)
        fa = nn.functional.normalize(fa, p=2, dim=1)
        fv = nn.functional.normalize(fv, p=2, dim=1)
        return (fa * fv).sum(dim=1)  # cosine similarity: (B,)


# ---------------------------------------------------------------------------
# Model singleton — loaded once, shared across all requests
# ---------------------------------------------------------------------------

_sync_model: SyncNet_color | None = None


def get_sync_model() -> SyncNet_color:
    """
    Return the SyncNet model, loading weights on first call.

    CRITICAL: Never raises FileNotFoundError when weights are missing.
    Logs a warning and continues with random weights so the service
    stays alive during development before lipsync_expert.pth is downloaded.
    """
    global _sync_model
    if _sync_model is not None:
        return _sync_model

    _sync_model = SyncNet_color().to(DEVICE)

    if WEIGHTS_PATH.exists():
        logger.info("Loading SyncNet weights from %s ...", WEIGHTS_PATH)
        state = torch.load(str(WEIGHTS_PATH), map_location=DEVICE)
        # Wav2Lip checkpoints store weights under the 'state_dict' key
        if "state_dict" in state:
            _sync_model.load_state_dict(state["state_dict"])
        else:
            _sync_model.load_state_dict(state)
        _sync_model.eval()
        logger.info("SyncNet loaded from %s on %s", WEIGHTS_PATH, DEVICE)
    else:
        logger.warning(
            "Wav2Lip weights not found at %s. Running with random weights — scores will be unreliable. "
            "Download lipsync_expert.pth from https://github.com/Rudrabha/Wav2Lip and place it "
            "in ml-services/lipsync_service/weights/",
            WEIGHTS_PATH,
        )
        _sync_model.eval()

    return _sync_model


# ---------------------------------------------------------------------------
# Lip crop extraction
# ---------------------------------------------------------------------------

def extract_lip_crops(video_path: str) -> tuple[list, float]:
    """
    Extract per-frame lip region crops from a video using MediaPipe Face Mesh.

    Returns a list of (IMG_SIZE, IMG_SIZE, 3) uint8 arrays (one per frame)
    and the video FPS. Frames with no detected face return a zero array.

    CRITICAL: FaceMesh is instantiated ONCE before the loop to avoid OOM
    crashes on long videos. face_mesh.close() is called unconditionally
    in the finally block.
    """
    logger.info("Lip crop extraction: opening video %s", video_path)
    lip_crops: list[np.ndarray] = []

    # -----------------------------------------------------------------------
    # CRITICAL: Single FaceMesh instance for the entire video
    # -----------------------------------------------------------------------
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
    )

    cap = cv2.VideoCapture(video_path)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0 or fps is None:
            fps = 25.0
            logger.warning("Lip crop: FPS reported as 0; falling back to %.1f", fps)

        blank = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = face_mesh.process(rgb)

            if result.multi_face_landmarks:
                landmarks = result.multi_face_landmarks[0].landmark

                # Scale outer lip landmarks to pixel coordinates
                pts = np.array(
                    [[int(landmarks[idx].x * w), int(landmarks[idx].y * h)]
                     for idx in LIP_OUTER],
                    dtype=np.int32,
                )

                # Bounding box with 10px padding, clamped to frame boundaries
                x1 = max(0, int(pts[:, 0].min()) - 10)
                y1 = max(0, int(pts[:, 1].min()) - 10)
                x2 = min(w, int(pts[:, 0].max()) + 10)
                y2 = min(h, int(pts[:, 1].max()) + 10)

                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    crop_resized = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
                    lip_crops.append(crop_resized)
                else:
                    lip_crops.append(blank.copy())
            else:
                lip_crops.append(blank.copy())

            frame_idx += 1

    finally:
        cap.release()
        face_mesh.close()  # always release MediaPipe resources
        logger.info(
            "Lip crops extracted: %d frames processed, fps=%.2f",
            frame_idx,
            fps,
        )

    return lip_crops, fps


# ---------------------------------------------------------------------------
# Main analysis entry point
# ---------------------------------------------------------------------------

def analyze_lipsync(video_path: str) -> dict:
    """
    Run Wav2Lip SyncNet lipsync analysis on a video file.

    Pipeline:
    1. Load SyncNet model (singleton)
    2. Extract audio + MFCCs
    3. Extract per-frame lip crops
    4. Score each 5-frame window with SyncNet
    5. Skip silent windows to avoid false positives
    6. Merge adjacent flagged segments
    7. Return verdict + sync_score + flagged_segments

    Returns a dict matching the LipSyncResult schema.
    """
    model = get_sync_model()

    # -----------------------------------------------------------------------
    # 1. Audio extraction
    # -----------------------------------------------------------------------
    try:
        audio, sr = extract_audio_wav(video_path, target_sr=16000)
    except RuntimeError as exc:
        logger.warning("Audio extraction failed (%s) — treating as silent video", exc)
        audio = np.zeros(16000, dtype=np.float32)
        sr = 16000

    # -----------------------------------------------------------------------
    # 2. Lip crop extraction
    # -----------------------------------------------------------------------
    lip_crops, fps = extract_lip_crops(video_path)

    # -----------------------------------------------------------------------
    # 3. Insufficient data guard
    # -----------------------------------------------------------------------
    if len(lip_crops) < WINDOW_FRAMES:
        logger.warning(
            "analyze_lipsync: only %d frames available (need %d)",
            len(lip_crops),
            WINDOW_FRAMES,
        )
        return {
            "sync_score": 0.5,
            "verdict": "INSUFFICIENT_DATA",
            "flagged_segments": [],
            "windows_analyzed": 0,
        }

    # -----------------------------------------------------------------------
    # 4. MFCC computation
    # -----------------------------------------------------------------------
    mfcc = compute_mfcc(audio, sr)  # shape: (40, T_audio)
    audio_frames_per_video_frame = mfcc.shape[1] / len(lip_crops)

    # -----------------------------------------------------------------------
    # 5. Sliding window inference
    # -----------------------------------------------------------------------
    window_scores: list[float] = []
    flagged_segments: list[dict] = []

    for i in range(0, len(lip_crops) - WINDOW_FRAMES, WINDOW_STRIDE):
        window_frames = lip_crops[i: i + WINDOW_FRAMES]

        # Audio slice corresponding to this window
        a_start = int(i * audio_frames_per_video_frame)
        a_end   = int((i + WINDOW_FRAMES) * audio_frames_per_video_frame)
        if a_end > mfcc.shape[1]:
            continue
        audio_slice = mfcc[:, a_start:a_end]

        # Skip silent windows — silence is not evidence of fake
        frame_samples_start = int((i / fps) * sr)
        frame_samples_end   = int(((i + WINDOW_FRAMES) / fps) * sr)
        if is_silent(audio[frame_samples_start:frame_samples_end], SILENCE_RMS_THRESH):
            continue

        # -------------------------------------------------------------------
        # Prepare video tensor: stack 5 RGB frames on channel dim
        # Shape: (15, IMG_SIZE, IMG_SIZE) → (1, 15, IMG_SIZE, IMG_SIZE)
        # -------------------------------------------------------------------
        stacked = np.concatenate(
            [f.transpose(2, 0, 1) for f in window_frames],  # each: (3, H, W)
            axis=0,
        ).astype(np.float32) / 255.0  # (15, IMG_SIZE, IMG_SIZE), normalised [0,1]

        video_tensor = torch.from_numpy(stacked).unsqueeze(0).to(DEVICE)

        # -------------------------------------------------------------------
        # Prepare audio tensor: resize MFCC slice to (80, 16)
        # Shape: (80, 16) → (1, 1, 80, 16)
        # Use skimage.transform.resize — handles 2D float arrays cleanly
        # -------------------------------------------------------------------
        mfcc_resized = resize(
            audio_slice,
            (80, 16),
            anti_aliasing=True,
            mode="reflect",
        ).astype(np.float32)

        audio_tensor = (
            torch.from_numpy(mfcc_resized)
            .unsqueeze(0)   # (1, 80, 16)
            .unsqueeze(0)   # (1, 1, 80, 16)
            .to(DEVICE)
        )

        # -------------------------------------------------------------------
        # SyncNet inference
        # -------------------------------------------------------------------
        with torch.no_grad():
            score = float(torch.sigmoid(model(audio_tensor, video_tensor)).item())

        window_scores.append(score)
        start_sec = round(i / fps, 2)
        end_sec   = round((i + WINDOW_FRAMES) / fps, 2)

        if score < 0.4:  # out-of-sync threshold
            flagged_segments.append({
                "start_sec": start_sec,
                "end_sec": end_sec,
                "score": round(score, 3),
            })

    # -----------------------------------------------------------------------
    # 6. No speech detected guard
    # -----------------------------------------------------------------------
    if not window_scores:
        logger.warning("analyze_lipsync: no non-silent windows found")
        return {
            "sync_score": 0.5,
            "verdict": "NO_SPEECH_DETECTED",
            "flagged_segments": [],
            "windows_analyzed": 0,
        }

    mean_score = float(np.mean(window_scores))

    # -----------------------------------------------------------------------
    # 7. Verdict
    # -----------------------------------------------------------------------
    if mean_score < 0.4:
        verdict = "OUT_OF_SYNC"
    elif mean_score < 0.65:
        verdict = "UNCERTAIN"
    else:
        verdict = "IN_SYNC"

    # -----------------------------------------------------------------------
    # 8. Merge adjacent flagged segments (gap < 0.5s)
    # -----------------------------------------------------------------------
    merged: list[dict] = []
    for seg in flagged_segments:
        if merged and seg["start_sec"] - merged[-1]["end_sec"] < 0.5:
            merged[-1]["end_sec"] = seg["end_sec"]
            merged[-1]["score"]   = round((merged[-1]["score"] + seg["score"]) / 2, 3)
        else:
            merged.append(dict(seg))

    logger.info(
        "analyze_lipsync complete — score=%.4f verdict=%s windows=%d flagged=%d",
        mean_score,
        verdict,
        len(window_scores),
        len(merged),
    )

    return {
        "sync_score": round(mean_score, 4),
        "verdict": verdict,
        "flagged_segments": merged[:10],  # cap at 10 entries for payload size
        "windows_analyzed": len(window_scores),
    }
