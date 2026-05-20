function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
    // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
    // FFT's artifact_score is already on this scale
    const fftFakeProb = fftResult.artifact_score;

    // Liveness and LipSync return "authenticity" scores (1 = REAL, 0 = FAKE),
    // so we invert them: 1 - score
    const livenessFakeProb = 1 - livenessResult.liveness_score;
    const lipsyncFakeProb  = 1 - lipsyncResult.sync_score;

    // ── Weights ──────────────────────────────────────────────────────────────
    //
    // ⚠️  WHY LIVENESS WEIGHT IS LOW:
    //   rPPG + blink detects REPLAY SPOOFING (printed photos, screen replays).
    //   It does NOT detect AI-generated deepfakes. High-quality AI video renders
    //   convincing face motion / blink / colour changes, so liveness will almost
    //   always report "authentic" even for fakes.  FFT artifact analysis is the
    //   primary signal for AI-generated content.
    //
    let fftW, livenessW, lipsyncW;
    if (lipsyncResult.weights_loaded === false) {
        // Lipsync model not loaded — FFT carries the full non-liveness weight
        fftW      = 0.75;
        livenessW = 0.25;
        lipsyncW  = 0.00;
    } else if (lipsyncResult.verdict === 'UNCERTAIN') {
        // Lipsync uncertain — still a meaningful signal, keep moderate weight
        fftW      = 0.50;
        livenessW = 0.20;
        lipsyncW  = 0.30;
    } else {
        // Lipsync has a clear verdict — give it full influence
        fftW      = 0.45;
        livenessW = 0.15;
        lipsyncW  = 0.40;
    }

    // ── Weighted fake probability ─────────────────────────────────────────────
    let finalFakeProb = (fftFakeProb * fftW) +
                        (livenessFakeProb * livenessW) +
                        (lipsyncFakeProb  * lipsyncW);

    // ── Boost: FFT uncertain + lipsync uncertain is the classic AI-video pattern
    if (fftFakeProb >= 0.45 && lipsyncResult.verdict === 'UNCERTAIN') {
        finalFakeProb = Math.min(1.0, finalFakeProb + 0.06);
    }

    // ── Boost: 90 %+ of frames flagged as suspicious by FFT — very strong signal
    const fftSuspiciousRatio = (fftResult.suspicious_frames && fftResult.total_frames_analyzed)
        ? fftResult.suspicious_frames.length / fftResult.total_frames_analyzed
        : 0;
    if (fftSuspiciousRatio >= 0.90) {
        finalFakeProb = Math.min(1.0, finalFakeProb + 0.08);
    }

    finalFakeProb = Math.min(1.0, Math.max(0.0, finalFakeProb));

    // ── Verdict thresholds ────────────────────────────────────────────────────
    //   REAL      < 0.30  — strong multi-signal evidence of authenticity
    //   UNCERTAIN   0.30–0.55
    //   FAKE      > 0.55  — lower bar than before; better to flag for human review
    let verdict;
    if (finalFakeProb < 0.30) {
        verdict = 'REAL';
    } else if (finalFakeProb > 0.55) {
        verdict = 'FAKE';
    } else {
        verdict = 'UNCERTAIN';
    }

    // ── Strong-FAKE override: FFT + lipsync both clearly say fake
    if (fftFakeProb > 0.65 && lipsyncFakeProb > 0.55) {
        verdict = 'FAKE';
    }

    // ── Strong-REAL override: ALL three signals agree with high confidence
    //    (any uncertainty keeps the verdict at UNCERTAIN)
    if (fftFakeProb < 0.30 && livenessFakeProb < 0.20 && lipsyncFakeProb < 0.35) {
        verdict = 'REAL';
    }

    // ── Confidence ───────────────────────────────────────────────────────────
    let confidence;
    if (verdict === 'REAL') {
        confidence = 1 - finalFakeProb;
    } else if (verdict === 'FAKE') {
        confidence = finalFakeProb;
    } else {
        confidence = finalFakeProb;
    }

    return {
        verdict,
        confidence: Number(confidence.toFixed(4)),
        breakdown: {
            finalFakeProbability: Number(finalFakeProb.toFixed(4)),
            weightsUsed: { fft: fftW, liveness: livenessW, lipsync: lipsyncW },
            fft: {
                rawScore:         fftResult.artifact_score,
                unifiedFakeProb:  fftFakeProb,
                suspiciousRatio:  Number(fftSuspiciousRatio.toFixed(4)),
            },
            liveness: {
                rawScore:        livenessResult.liveness_score,
                unifiedFakeProb: livenessFakeProb,
                note: 'rPPG/blink detects replay spoofing — intentionally low weight for AI deepfake detection',
            },
            lipsync: {
                rawScore:         lipsyncResult.sync_score,
                unifiedFakeProb:  lipsyncFakeProb,
                weightsLoaded:    lipsyncResult.weights_loaded ?? true,
                windows_analyzed: lipsyncResult.windows_analyzed ?? 0,
                verdict:          lipsyncResult.verdict ?? null,
                flagged_segments: lipsyncResult.flagged_segments ?? [],
            },
        },
    };
}


module.exports = { computeFinalVerdict };