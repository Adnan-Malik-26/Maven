import numpy as np
from scipy.signal import correlate
import logging

logger = logging.getLogger(__name__)

def compute_sync_score(lip_movements, audio_features):
    logger.info("Computing cross-modal synchronization score")
    
    if len(lip_movements) == 0 or len(audio_features) == 0:
        return 0.0

    lips = np.array(lip_movements, dtype=np.float32)
    # Use the first MFCC coefficient which correlates with audio energy/loudness
    audio_energy_proxy = audio_features[:, 0]
    
    # Normalize lips
    if np.std(lips) > 0:
        lips = (lips - np.mean(lips)) / np.std(lips)
    else:
        lips = lips - np.mean(lips)
        
    # Normalize audio energy
    if np.std(audio_energy_proxy) > 0:
        audio_energy_proxy = (audio_energy_proxy - np.mean(audio_energy_proxy)) / np.std(audio_energy_proxy)
    else:
        audio_energy_proxy = audio_energy_proxy - np.mean(audio_energy_proxy)
        
    # Truncate to the minimum length (aligning the sequences)
    min_len = min(len(lips), len(audio_energy_proxy))
    
    lips_aligned = lips[:min_len]
    audio_aligned = audio_energy_proxy[:min_len]
    
    # If sequences are too short, return 0.0
    if min_len < 10:
        return 0.0
    
    # Calculate Cross-Correlation at zero lag
    raw_correlation = correlate(lips_aligned, audio_aligned, mode='valid')
    
    if len(raw_correlation) > 0:
        raw_score = raw_correlation[0] / min_len
    else:
        raw_score = 0.0
        
    # Shift correlation [-1, 1] to a sync score [0, 1]
    # In real world, synchronous lips and audio don't always have a correlation perfectly at 1.0,
    # but a higher positive correlation indicates synchronization.
    sync_score = (raw_score + 1.0) / 2.0
    sync_score = max(0.0, min(1.0, float(sync_score)))
    
    return sync_score
