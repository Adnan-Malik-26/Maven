from moviepy import VideoFileClip
import librosa
import numpy as np
import tempfile
import os
import logging

logger = logging.getLogger(__name__)

def extract_audio_features(video_path: str):
    logger.info(f"Extracting audio features from {video_path}")
    temp_audio_path = tempfile.mktemp(suffix=".wav")
    try:
        video = VideoFileClip(video_path)
        if video.audio is None:
            logger.warning("No audio track found in video")
            # Return dummy empty array if no audio
            return np.zeros((1, 20))
            
        video.audio.write_audiofile(temp_audio_path, logger=None, verbose=False)
        
        # Load audio using librosa
        y, sr = librosa.load(temp_audio_path, sr=16000)
        
        # Extract MFCCs
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
        
        # Output shape: (time_steps, n_mfcc)
        return mfccs.T
    finally:
        if os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except OSError:
                pass
