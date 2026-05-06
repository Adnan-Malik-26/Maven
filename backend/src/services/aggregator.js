function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
    // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
    // FFT's artifact_score is already on this scale
    const fftFakeProb = fftResult.artifact_score;

    // Liveness and LipSync return "authenticity" scores (1 = REAL, 0 = FAKE),
    // so we invert them: 1 - score
    const livenessFakeProb = 1 - livenessResult.liveness_score;
    const lipsyncFakeProb = 1 - lipsyncResult.sync_score;

    // Base weights. Liveness (rPPG + blink) is the strongest biological signal.
    let fftW, livenessW, lipsyncW;
    if (lipsyncResult.weights_loaded === false) {
        // Lipsync model not loaded — drop it entirely
        fftW      = 0.45;
        livenessW = 0.55;
        lipsyncW  = 0.00;
    } else if (lipsyncResult.verdict === 'UNCERTAIN') {
        // Lipsync can't make a confident call — halve its influence and
        // redistribute to liveness (stronger physiological signal).
        fftW      = 0.33;
        livenessW = 0.52;
        lipsyncW  = 0.15;
    } else {
        fftW      = 0.30;
        livenessW = 0.40;
        lipsyncW  = 0.30;
    }

    // Compute weighted average
    const finalFakeProb = (fftFakeProb * fftW) +
        (livenessFakeProb * livenessW) +
        (lipsyncFakeProb * lipsyncW);

    // REAL < 0.38 | UNCERTAIN 0.38–0.60 | FAKE > 0.60
    // REAL threshold raised from 0.30 → 0.38: lipsync alone (often noisy)
    // was pushing borderline-real videos into UNCERTAIN.
    let verdict;
    if (finalFakeProb < 0.38) {
        verdict = 'REAL';
    } else if (finalFakeProb > 0.60) {
        verdict = 'FAKE';
    } else {
        verdict = 'UNCERTAIN';
    }

    // Strong-liveness REAL override: rPPG + blink is the hardest signal for AI
    // to fake. If liveness clearly says REAL and FFT also leans authentic, trust it.
    if (livenessFakeProb < 0.25 && fftFakeProb < 0.50 && finalFakeProb < 0.48) {
        verdict = 'REAL';
    }

    // Strong-liveness FAKE override: complete absence of biological signals
    // is equally hard to fake in the other direction.
    if (livenessFakeProb > 0.70 && finalFakeProb > 0.45) {
        verdict = 'FAKE';
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
                weightsLoaded: lipsyncResult.weights_loaded ?? true,
                windows_analyzed: lipsyncResult.windows_analyzed ?? 0,
                verdict: lipsyncResult.verdict ?? null,
                flagged_segments: lipsyncResult.flagged_segments ?? [],
            }
        }
    };
}


module.exports = {
    computeFinalVerdict
}