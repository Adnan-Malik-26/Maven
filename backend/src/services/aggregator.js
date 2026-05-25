function computeFinalVerdict({ fftResult, livenessResult, lipsyncResult }) {
  // Convert scores to a unified "fake probability" scale (0 = REAL, 1 = FAKE)
  const fftFakeProb = fftResult.artifact_score;
  const livenessFakeProb = 1 - livenessResult.liveness_score;
  const lipsyncFakeProb = 1 - lipsyncResult.sync_score;

  // ── Temporal consistency ────────────────────────────────────────────────
  const temporal = fftResult.temporal_consistency;
  const temporalScore = temporal?.temporal_consistency_score ?? 0.5;
  const temporalFakeProb = 1 - temporalScore;
  const temporalAvailable = temporal != null && temporal.n_frames >= 2;

  // ── Weights ─────────────────────────────────────────────────────────────
  let fftW, livenessW, lipsyncW, temporalW;

  if (!temporalAvailable) {
    temporalW = 0.0;

    if (lipsyncResult.weights_loaded === false) {
      fftW = 0.8;
      livenessW = 0.2;
      lipsyncW = 0.0;
    } else if (lipsyncResult.verdict === "UNCERTAIN") {
      fftW = 0.6;
      livenessW = 0.1;
      lipsyncW = 0.3;
    } else {
      fftW = 0.55;
      livenessW = 0.1;
      lipsyncW = 0.35;
    }
  } else {
    temporalW = 0.15;

    if (lipsyncResult.weights_loaded === false) {
      fftW = 0.7;
      livenessW = 0.15;
      lipsyncW = 0.0;
    } else if (lipsyncResult.verdict === "UNCERTAIN") {
      fftW = 0.5;
      livenessW = 0.05;
      lipsyncW = 0.3;
    } else {
      fftW = 0.45;
      livenessW = 0.05;
      lipsyncW = 0.35;
    }
  }

  // ── Weighted fake probability ──────────────────────────────────────────
  let finalFakeProb =
    fftFakeProb * fftW +
    livenessFakeProb * livenessW +
    lipsyncFakeProb * lipsyncW +
    temporalFakeProb * temporalW;

  // ── Boost: FFT uncertain + lipsync uncertain ───────────────────────────
  if (fftFakeProb >= 0.45 && lipsyncResult.verdict === "UNCERTAIN") {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.06);
  }

  // ── Boost: suspicious FFT frames ───────────────────────────────────────
  const fftSuspiciousRatio =
    fftResult.suspicious_frames && fftResult.total_frames_analyzed
      ? fftResult.suspicious_frames.length / fftResult.total_frames_analyzed
      : 0;

  if (fftSuspiciousRatio >= 0.95) {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.08);
  }

  // ── Boost: severe temporal inconsistency ───────────────────────────────
  if (temporalAvailable && temporalScore < 0.4) {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.05);
  }

  finalFakeProb = Math.min(1.0, Math.max(0.0, finalFakeProb));

  // ── Verdict thresholds ─────────────────────────────────────────────────
  let verdict;

  if (finalFakeProb < 0.46) {
    verdict = "REAL";
  } else if (finalFakeProb > 0.55) {
    verdict = "FAKE";
  } else {
    verdict = "UNCERTAIN";
  }

  // ── Strong-FAKE override ───────────────────────────────────────────────
  if (fftFakeProb > 0.65 && lipsyncFakeProb > 0.55) {
    verdict = "FAKE";
  }

  // ── Strong-REAL override ───────────────────────────────────────────────
  if (fftFakeProb < 0.3 && livenessFakeProb < 0.2 && lipsyncFakeProb < 0.6) {
    verdict = "REAL";
  }

  // ── Confidence ─────────────────────────────────────────────────────────
  const confidence = verdict === "REAL" ? 1 - finalFakeProb : finalFakeProb;

  return {
    verdict,
    confidence: Number(confidence.toFixed(4)),
    breakdown: {
      finalFakeProbability: Number(finalFakeProb.toFixed(4)),

      weightsUsed: {
        fft: fftW,
        liveness: livenessW,
        lipsync: lipsyncW,
        temporal: temporalW,
      },

      fft: {
        rawScore: fftResult.artifact_score,
        unifiedFakeProb: fftFakeProb,
        suspiciousRatio: Number(fftSuspiciousRatio.toFixed(4)),
      },

      liveness: {
        rawScore: livenessResult.liveness_score,
        unifiedFakeProb: livenessFakeProb,
        note: "rPPG/blink detects replay spoofing — intentionally low weight for AI deepfake detection",
      },

      lipsync: {
        rawScore: lipsyncResult.sync_score,
        unifiedFakeProb: lipsyncFakeProb,
        weightsLoaded: lipsyncResult.weights_loaded ?? true,
        windows_analyzed: lipsyncResult.windows_analyzed ?? 0,
        verdict: lipsyncResult.verdict ?? null,
        flagged_segments: lipsyncResult.flagged_segments ?? [],
      },

      temporal: {
        available: temporalAvailable,
        consistency_score: Number(temporalScore.toFixed(4)),
        unifiedFakeProb: Number(temporalFakeProb.toFixed(4)),
        worst_window: temporal?.worst_window ?? null,
        n_frames: temporal?.n_frames ?? 0,
      },
    },
  };
}

<<<<<<< HEAD
module.exports = { computeFinalVerdict };

=======

module.exports = { computeFinalVerdict };
>>>>>>> 58b6e441b76b9f1d17c5a2b26a967de58f082a13
