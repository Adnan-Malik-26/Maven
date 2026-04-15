# LipSync Service Python Files Documentation

This document provides a detailed explanation of the working of each Python (`.py`) file in the `lipsync_service` repository.

## 1. `main.py`
This is the main entry point for the LipSync microservice, built using **FastAPI**. 
- It sets up an HTTP server running on port `8003` with a single POST endpoint `/analyze`.
- The endpoint takes a JSON payload with a `video_path` via the `AnalyzeRequest` Pydantic model.
- **Workflow**:
  1. It validates the existence of the provided video file path.
  2. It calls `extract_lip_movements()` to get sequential geometric features of the subject's lips across the video frames.
  3. It calls `extract_audio_features()` to get corresponding temporal audio features from the video's audio track.
  4. It passes both streams to `compute_sync_score()` which generates a normalized correlation score signifying how well audio timing perfectly matches lip movements.
  5. It classifies the video as `"REAL"` if the score exceeds `0.52` (indicating biological sync) or `"FAKE"` if it doesn't. 
  6. It returns the classification verdict along with the exact `sync_score` and heavily inverted `artifact_score`.

## 2. `lip_tracker.py`
This file is responsible for visually tracking the vertical mouth opening of the speaker in the video over time.
- **Dependencies**: It heavily relies on **MediaPipe** (specifically the `FaceLandmarker` task) and **OpenCV**.
- **Model downloading**: It employs a helper function `get_model()` that automatically downloads the `face_landmarker.task` model from Google Cloud Storage into the `models/` directory if missing.
- **Working (`extract_lip_movements`)**:
  - Sets up the MediaPipe landmarker with a 50% detection and tracking confidence.
  - Reads the video frame-by-frame via OpenCV (`cv2.VideoCapture`).
  - Converts frames from BGR to RGB format to comply with MediaPipe's inputs.
  - Locates face landmarks, particularly focusing on the `UPPER_LIP` (index 13) and `LOWER_LIP` (index 14).
  - Calculates the absolute vertical distance between the Y-coordinates of these two lips for every single frame and compiles them into a sequence.
  - Returns a 1D `numpy` array representing the time-series fluctuation of mouth movement. 

## 3. `audio_processor.py`
This script extracts relevant signal-processing features from the video's audio track to correlate with the visual lip data.
- **Dependencies**: Uses `moviepy` for extraction and `librosa` for audio frequency analysis.
- **Working (`extract_audio_features`)**:
  - Pulls the audio sequence directly from the MP4 video using `VideoFileClip`.
  - Saves the extracted audio temporarily into a `.wav` file format.
  - Loads the temporal `.wav` file using `librosa` forced to a standard `16kHz` sampling rate.
  - Runs a Mel-Frequency Cepstral Coefficients (MFCCs) mathematical extraction, pulling 20 features (`n_mfcc=20`) over short overlapping windows of the audio.
  - Deletes the temporary `.wav` file after processing and returns the transposed time-series multi-dimensional MFCC array.

## 4. `cross_modal_transformer.py`
This module acts as the evaluator; it mathematically measures the synchronization between the output of `lip_tracker` and `audio_processor`.
- **Working (`compute_sync_score`)**:
  - Triggers a check to ensure both streams have meaningful data.
  - Isolates the *1st element* of the MFCC feature arrays calculated earlier, which normally corresponds natively to the proxy of absolute audio energy/loudness. (Assuming that heavy energetic peaks in voice align directly with broad mouth openings).
  - **Normalization**: Translates both sequences to zero mean and unit variance (`z-score` normalization) utilizing standard deviations so volume bounds or physical lip size variations do not skew relative correlation.
  - Aligns the lengths of both arrays to their shortest overlapping time block minimum length.
  - **Zero-lag Cross Correlation**: Calculates raw numeric correlation via SciPy's `correlate(mode='valid')`. 
  - Fits the raw correlation score from roughly a structural range of `[-1, 1]` up to a unified probability-like score bound `[0, 1]`, and returns it as the `sync_score`.

## 5. `test.py`
A simple utility script used primarily for setup purposes. 
- It houses a `download_model()` function that manually ensures the MediaPipe `face_landmarker.task` file exists under the `models/` directory, fetching the 16-bit float weight map off Google Storage over HTTP if it's absent.

## 6. `models/sync_transformer.py`
Currently, this is an empty module (containing zero functional lines of code). It ostensibly acts as a scaffolding placeholder, likely reserved for transitioning the logic inside `cross_modal_transformer.py` from basic signal cross-correlation to a more robust Deep Learning Transformer-based cross-modal architecture in the future.
