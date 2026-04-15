import urllib.request
import os
def download_model():
    path = "models/face_landmarker.task"
    if not os.path.exists(path):
        os.makedirs("models", exist_ok=True)
        print("Downloading face_landmarker.task...")
        urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', path)
download_model()
