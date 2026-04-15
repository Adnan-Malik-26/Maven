from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import os
import logging
from lip_tracker import extract_lip_movements
from audio_processor import extract_audio_features
from cross_modal_transformer import compute_sync_score

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LipSync Service")

class AnalyzeRequest(BaseModel):
    video_path: str

@app.post("/analyze")
def analyze_video(req: AnalyzeRequest):
    logger.info(f"Received request to analyze {req.video_path}")
    if not os.path.exists(req.video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
        
    try:
        lip_movements = extract_lip_movements(req.video_path)
        audio_features = extract_audio_features(req.video_path)
        sync_score = compute_sync_score(lip_movements, audio_features)
        
        # Consider score > 0.52 to be mildly correlated, indicating real sync
        verdict = "REAL" if sync_score > 0.52 else "FAKE"
        
        return {
            "verdict": verdict,
            "sync_score": round(sync_score, 4),
            "artifact_score": round(1.0 - sync_score, 4)
        }
    except Exception as e:
        logger.error(f"Failed to process video: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
