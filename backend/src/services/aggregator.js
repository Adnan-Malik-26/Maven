function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
    // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
    // FFT's artifact_score is already on this scale
    const fftFakeProb = fftResult.artifact_score;

    // Liveness and LipSync return "authenticity" scores (1 = REAL, 0 = FAKE),
    // so we invert them: 1 - score
    const livenessFakeProb = 1 - livenessResult.liveness_score;
    const lipsyncFakeProb = 1 - lipsyncResult.sync_score;

    // When SyncNet weights are absent, scores are random noise — redistribute
    // lipsync's 30% weight proportionally to FFT and liveness instead
    let fftW, livenessW, lipsyncW;
    if (lipsyncResult.weights_loaded === false) {
        fftW      = 0.43;  // 0.30 / 0.70 * 1.0 redistributed
        livenessW = 0.57;  // 0.40 / 0.70 * 1.0
        lipsyncW  = 0.00;
    } else {
        fftW      = 0.30;
        livenessW = 0.40;
        lipsyncW  = 0.30;
    }

    // Compute weighted average
    const finalFakeProb = (fftFakeProb * fftW) +
        (livenessFakeProb * livenessW) +
        (lipsyncFakeProb * lipsyncW);

    // Apply thresholds
    // < 0.40 = REAL, 0.40–0.65 = UNCERTAIN, > 0.65 = FAKE
    let verdict;
    if (finalFakeProb < 0.40) {
        verdict = 'REAL';
    } else if (finalFakeProb > 0.65) {
        verdict = 'FAKE';
    } else {
        verdict = 'UNCERTAIN';
    }

    // Calculate confidence
    // If verdict is REAL, confidence is how close the prob is to 0
    // If verdict is FAKE, confidence is how close the prob is to 1
    // If UNCERTAIN, confidence can just be the raw fake probability or 0
    let confidence;
    if (verdict === 'REAL') {
        confidence = 1 - finalFakeProb;
    } else if (verdict === 'FAKE') {
        confidence = finalFakeProb;
    } else {
        confidence = finalFakeProb;
    }

    // Return the compiled result
    return {
        verdict,
        // Round confidence to 4 decimal places for clean outputs
        confidence: Number(confidence.toFixed(4)),
        breakdown: {
            finalFakeProbability: Number(finalFakeProb.toFixed(4)),
            weightsUsed: { fft: fftW, liveness: livenessW, lipsync: lipsyncW },
            fft: {
                rawScore: fftResult.artifact_score,
                unifiedFakeProb: fftFakeProb
            },
            liveness: {
                rawScore: livenessResult.liveness_score,
                unifiedFakeProb: livenessFakeProb
            },
            lipsync: {
                rawScore: lipsyncResult.sync_score,
                unifiedFakeProb: lipsyncFakeProb,
                weightsLoaded: lipsyncResult.weights_loaded ?? true
            }
        }
    };
}


module.exports = {
    computeFinalVerdict
}