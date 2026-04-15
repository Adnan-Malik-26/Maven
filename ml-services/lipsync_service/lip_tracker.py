import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import logging
import os
import urllib.request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Indices for lips based on mediapipe FaceMesh
UPPER_LIP = 13
LOWER_LIP = 14
LEFT_LIP = 78
RIGHT_LIP = 308

MODEL_PATH = "models/face_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

def get_model():
    if not os.path.exists(MODEL_PATH):
        logger.info(f"Downloading face landmarker model from {MODEL_URL}...")
        os.makedirs("models", exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH

def extract_lip_movements(video_path: str):
    logger.info(f"Extracting lip movements from {video_path}")
    
    model_path = get_model()
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        running_mode=vision.RunningMode.IMAGE
    )

    cap = cv2.VideoCapture(video_path)
    lip_movements = []

    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Convert the BGR image to RGB before processing.
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
            
            results = landmarker.detect(mp_image)
            
            if results.face_landmarks:
                for face_landmarks in results.face_landmarks:
                    h, w, _ = frame.shape
                    
                    upper_y = face_landmarks[UPPER_LIP].y * h
                    lower_y = face_landmarks[LOWER_LIP].y * h
                    
                    # Ensure positive distance
                    vertical_dist = abs(lower_y - upper_y)
                    lip_movements.append(vertical_dist)
            else:
                # Append 0 if no face is detected
                lip_movements.append(0.0)
                
    cap.release()
    return np.array(lip_movements)
