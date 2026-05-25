function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
    // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
    const fftFakeProb      = fftResult.artifact_score;
    const livenessFakeProb = 1 - livenessResult.liveness_score;
    const lipsyncFakeProb  = 1 - lipsyncResult.sync_score;

    // ── Temporal consistency (new 4th signal) ────────────────────────────────
    // temporal_consistency_score: 1=consistent/real, 0=erratic/fake
    // Only available if ViT embedding extraction succeeded (fallback: neutral 0.5)
    const temporal = fftResult.temporal_consistency;
    const temporalScore    = temporal?.temporal_consistency_score ?? 0.5;
    const temporalFakeProb = 1 - temporalScore;
    const temporalAvailable = temporal != null && temporal.n_frames >= 2;

    // ── Weights ──────────────────────────────────────────────────────────────
    //
    // ⚠️  WHY LIVENESS WEIGHT IS LOW:
    //   rPPG + blink detects REPLAY SPOOFING (printed photos, screen replays).
    //   It does NOT detect AI-generated deepfakes. Face-swaps retain real
    //   physiological signals, so liveness will almost always say "authentic".
    //
    // Temporal consistency (ViT embedding cosine sim) IS sensitive to face-swaps
    // and takes 15% weight when available, drawn from FFT and liveness.
    //
    let fftW, livenessW, lipsyncW, temporalW;

    if (!temporalAvailable) {
        // No temporal signal — use 3-signal weights as before
        temporalW = 0.00;
        if (lipsyncResult.weights_loaded === false) {
            fftW = 0.80; livenessW = 0.20; lipsyncW = 0.00;
        } else if (lipsyncResult.verdict === 'UNCERTAIN') {
            fftW = 0.60; livenessW = 0.10; lipsyncW = 0.30;
        } else {
            fftW = 0.55; livenessW = 0.10; lipsyncW = 0.35;
        }
    } else {
        // Temporal available — add 15% weight, draw from FFT (−10%) and liveness (−5%)
        temporalW = 0.15;
        if (lipsyncResult.weights_loaded === false) {
            fftW = 0.70; livenessW = 0.15; lipsyncW = 0.00;
        } else if (lipsyncResult.verdict === 'UNCERTAIN') {
            fftW = 0.50; livenessW = 0.05; lipsyncW = 0.30;
        } else {
            fftW = 0.45; livenessW = 0.05; lipsyncW = 0.35;
        }
    }

    // ── Weighted fake probability ─────────────────────────────────────────────
    let finalFakeProb = (fftFakeProb      * fftW)      +
                        (livenessFakeProb  * livenessW) +
                        (lipsyncFakeProb   * lipsyncW)  +
                        (temporalFakeProb  * temporalW);

    // ── Boost: FFT uncertain + lipsync uncertain is the classic AI-video pattern
    if (fftFakeProb >= 0.45 && lipsyncResult.verdict === 'UNCERTAIN') {
        finalFakeProb = Math.min(1.0, finalFakeProb + 0.06);
    }

    // ── Boost: 95%+ of frames flagged as suspicious — very strong signal
    const fftSuspiciousRatio = (fftResult.suspicious_frames && fftResult.total_frames_analyzed)
        ? fftResult.suspicious_frames.length / fftResult.total_frames_analyzed
        : 0;
    if (fftSuspiciousRatio >= 0.95) {
        finalFakeProb = Math.min(1.0, finalFakeProb + 0.08);
    }

    // ── Boost: temporal inconsistency is severe — strong deepfake signal
    if (temporalAvailable && temporalScore < 0.40) {
        finalFakeProb = Math.min(1.0, finalFakeProb + 0.05);
    }

    finalFakeProb = Math.min(1.0, Math.max(0.0, finalFakeProb));

    // ── Verdict thresholds ────────────────────────────────────────────────────
    //   REAL      < 0.46  — clear multi-signal evidence of authenticity
    //   UNCERTAIN   0.46–0.55
    //   FAKE      > 0.55  — strong fake signal; flag for review
    let verdict;
    if (finalFakeProb < 0.46) {
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

    // ── Strong-REAL override: primary signals clean
    if (fftFakeProb < 0.30 && livenessFakeProb < 0.20 && lipsyncFakeProb < 0.60) {
        verdict = 'REAL';
    }

    // ── Confidence ───────────────────────────────────────────────────────────
    const confidence = verdict === 'REAL' ? 1 - finalFakeProb : finalFakeProb;

    return {
        verdict,
        confidence: Number(confidence.toFixed(4)),
        breakdown: {
            finalFakeProbability: Number(finalFakeProb.toFixed(4)),
            weightsUsed: { fft: fftW, liveness: livenessW, lipsync: lipsyncW, temporal: temporalW },
            fft: {
                rawScore:        fftResult.artifact_score,
                unifiedFakeProb: fftFakeProb,
                suspiciousRatio: Number(fftSuspiciousRatio.toFixed(4)),
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
            temporal: {
                available:          temporalAvailable,
                consistency_score:  Number(temporalScore.toFixed(4)),
                unifiedFakeProb:    Number(temporalFakeProb.toFixed(4)),
                worst_window:       temporal?.worst_window ?? null,
                n_frames:           temporal?.n_frames ?? 0,
            },
        },
    };
}


module.exports = { computeFinalVerdict };