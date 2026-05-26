/**
 * MAVEN — Final Verdict Aggregator
 *
 * Fuses results from 3 ML microservices (FFT, Liveness, LipSync) into
 * a single REAL / UNCERTAIN / FAKE verdict.
 *
 * Improvements over v1:
 *   - Model agreement scoring: counts how many models lean FAKE
 *   - Confidence-weighted fusion: high-confidence models count more
 *   - Expanded UNCERTAIN band: [0.40, 0.60] (was [0.46, 0.55])
 *   - Spectral and color signal integration from upgraded FFT service
 */

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

  // ── Jitter score (new from upgraded temporal analyzer) ──────────────────
  const jitterScore = temporal?.jitter_score ?? 0.0;

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

  // ── Confidence-weighted fusion ──────────────────────────────────────────
  // Each model's weight scales by its distance from the neutral 0.5 point.
  // A model that says 0.90 (very confident FAKE) should count more than
  // one saying 0.52 (barely leaning FAKE).
  const fftConfidence = Math.abs(fftFakeProb - 0.5) * 2;        // [0, 1]
  const livenessConfidence = Math.abs(livenessFakeProb - 0.5) * 2;
  const lipsyncConfidence = Math.abs(lipsyncFakeProb - 0.5) * 2;
  const temporalConfidence = Math.abs(temporalFakeProb - 0.5) * 2;

  // Scale weights by confidence (but keep base weights as minimum)
  const confBoost = 0.3;  // max 30% boost from confidence
  const adjFftW = fftW * (1.0 + confBoost * fftConfidence);
  const adjLivenessW = livenessW * (1.0 + confBoost * livenessConfidence);
  const adjLipsyncW = lipsyncW * (1.0 + confBoost * lipsyncConfidence);
  const adjTemporalW = temporalW * (1.0 + confBoost * temporalConfidence);

  // Normalize so weights sum to 1
  const totalW = adjFftW + adjLivenessW + adjLipsyncW + adjTemporalW;
  const normFftW = adjFftW / totalW;
  const normLivenessW = adjLivenessW / totalW;
  const normLipsyncW = adjLipsyncW / totalW;
  const normTemporalW = adjTemporalW / totalW;

  // ── Weighted fake probability ──────────────────────────────────────────
  let finalFakeProb =
    fftFakeProb * normFftW +
    livenessFakeProb * normLivenessW +
    lipsyncFakeProb * normLipsyncW +
    temporalFakeProb * normTemporalW;

  // ── Model agreement scoring ─────────────────────────────────────────────
  // Count how many independent signals lean FAKE (above 0.55)
  const fakeThreshold = 0.55;
  let modelsLeaningFake = 0;
  let modelsLeaningReal = 0;

  if (fftFakeProb > fakeThreshold) modelsLeaningFake++;
  else if (fftFakeProb < 0.40) modelsLeaningReal++;

  if (livenessFakeProb > fakeThreshold) modelsLeaningFake++;
  else if (livenessFakeProb < 0.40) modelsLeaningReal++;

  if (lipsyncResult.weights_loaded !== false) {
    if (lipsyncFakeProb > fakeThreshold) modelsLeaningFake++;
    else if (lipsyncFakeProb < 0.40) modelsLeaningReal++;
  }

  if (temporalAvailable) {
    if (temporalFakeProb > fakeThreshold) modelsLeaningFake++;
    else if (temporalFakeProb < 0.40) modelsLeaningReal++;
  }

  // Agreement boost: if 3+ models agree it's FAKE, boost the score
  if (modelsLeaningFake >= 3) {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.08);
  } else if (modelsLeaningFake >= 2) {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.04);
  }

  // Agreement damping: if only 1 model leans FAKE and others lean REAL, dampen
  if (modelsLeaningFake === 1 && modelsLeaningReal >= 2) {
    finalFakeProb = Math.max(0.0, finalFakeProb - 0.06);
  }

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

  // ── Boost: high temporal jitter (new) ──────────────────────────────────
  if (temporalAvailable && jitterScore > 0.6) {
    finalFakeProb = Math.min(1.0, finalFakeProb + 0.04);
  }

  finalFakeProb = Math.min(1.0, Math.max(0.0, finalFakeProb));

  // ── Verdict thresholds (expanded UNCERTAIN band) ───────────────────────
  let verdict;

  if (finalFakeProb < 0.40) {
    verdict = "REAL";
  } else if (finalFakeProb > 0.60) {
    verdict = "FAKE";
  } else {
    verdict = "UNCERTAIN";
  }

  // ── Strong-FAKE override ───────────────────────────────────────────────
  // Requires agreement from at least 2 models for override
  if (fftFakeProb > 0.65 && lipsyncFakeProb > 0.55) {
    verdict = "FAKE";
  }
  if (modelsLeaningFake >= 3 && finalFakeProb > 0.50) {
    verdict = "FAKE";
  }

  // ── Strong-REAL override ───────────────────────────────────────────────
  if (fftFakeProb < 0.3 && livenessFakeProb < 0.2 && lipsyncFakeProb < 0.6) {
    verdict = "REAL";
  }
  if (modelsLeaningReal >= 3 && finalFakeProb < 0.50) {
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
        fft: Number(normFftW.toFixed(4)),
        liveness: Number(normLivenessW.toFixed(4)),
        lipsync: Number(normLipsyncW.toFixed(4)),
        temporal: Number(normTemporalW.toFixed(4)),
      },

      modelAgreement: {
        modelsLeaningFake,
        modelsLeaningReal,
      },

      fft: {
        rawScore: fftResult.artifact_score,
        unifiedFakeProb: fftFakeProb,
        suspiciousRatio: Number(fftSuspiciousRatio.toFixed(4)),
      },

      liveness: {
        rawScore: livenessResult.liveness_score,
        unifiedFakeProb: livenessFakeProb,
        crossCorrelation: livenessResult.rppg?.cross_correlation ?? null,
        harmonicPresent: livenessResult.rppg?.harmonic_present ?? null,
        note: "rPPG/blink detects replay spoofing — weight scales by confidence",
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
        jitter_score: Number(jitterScore.toFixed(4)),
        worst_window: temporal?.worst_window ?? null,
        n_frames: temporal?.n_frames ?? 0,
      },
    },
  };
}

module.exports = { computeFinalVerdict };
