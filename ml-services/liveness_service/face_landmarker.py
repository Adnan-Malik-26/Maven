"""
Small compatibility wrapper around MediaPipe Tasks FaceLandmarker.

The installed MediaPipe package in this project exposes the modern Tasks API,
not the older `mp.solutions.face_mesh` namespace. This wrapper keeps the
liveness algorithms working with the same landmark indices.
"""

from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

SERVICE_DIR = Path(__file__).resolve().parent
MODEL_PATHS = [
    SERVICE_DIR / "models" / "face_landmarker.task",
    SERVICE_DIR.parent / "lipsync_service" / "models" / "face_landmarker.task",
]


def _model_path() -> str:
    for path in MODEL_PATHS:
        if path.exists():
            return str(path)
    raise FileNotFoundError(
        "face_landmarker.task was not found. Expected it under "
        "liveness_service/models or lipsync_service/models."
    )


def create_face_landmarker():
    base_options = python.BaseOptions(model_asset_path=_model_path())
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        running_mode=vision.RunningMode.IMAGE,
    )
    return vision.FaceLandmarker.create_from_options(options)


def detect_face_landmarks(landmarker, frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = landmarker.detect(image)
    if not result.face_landmarks:
        return None
    return result.face_landmarks[0]
