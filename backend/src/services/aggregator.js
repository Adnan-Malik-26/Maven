function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
    // Define weights
    const weights = {
        fft: 0.30,
        liveness: 0.40,
        lipsync: 0.30
    };

    // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
    // FFT's artifact_score is already on this scale
    const fftFakeProb = fftResult.artifact_score;

    // Liveness and LipSync return "authenticity" scores (1 = REAL, 0 = FAKE),
    // so we invert them: 1 - score
    const livenessFakeProb = 1 - livenessResult.liveness_score;
    const lipsyncFakeProb = 1 - lipsyncResult.sync_score;

    // Compute weighted average
    const finalFakeProb = (fftFakeProb * weights.fft) +
        (livenessFakeProb * weights.liveness) +
        (lipsyncFakeProb * weights.lipsync);

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
                unifiedFakeProb: lipsyncFakeProb
            }
        }
    };
}


module.exports = {
    computeFinalVerdict
}