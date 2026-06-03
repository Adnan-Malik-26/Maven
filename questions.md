# MAVEN — Final Project Evaluator Q&A
> **Based on:** `explain.md` (v2.0, exhaustive codebase analysis — June 2026)  
> **Project:** MAVEN — Multimodal Audio-Visual Examination Network  
> **Covers:** Technical depth, system design, ML engineering, UX, security, scalability, tradeoffs

---

## Table of Contents

1. [Project Overview & Motivation](#1-project-overview--motivation)
2. [System Architecture](#2-system-architecture)
3. [ML Layer 1 — FFT & Visual Analysis](#3-ml-layer-1--fft--visual-analysis)
4. [ML Layer 2 — Physiological Liveness (rPPG + Blink)](#4-ml-layer-2--physiological-liveness-rppg--blink)
5. [ML Layer 3 — Audio-Visual Lip Sync](#5-ml-layer-3--audio-visual-lip-sync)
6. [Score Fusion & Aggregation](#6-score-fusion--aggregation)
7. [Backend Engineering](#7-backend-engineering)
8. [Database Design & Security](#8-database-design--security)
9. [Frontend & User Experience](#9-frontend--user-experience)
10. [Performance Engineering](#10-performance-engineering)
11. [Scalability](#11-scalability)
12. [Technology Tradeoffs](#12-technology-tradeoffs)
13. [DevOps & Deployment](#13-devops--deployment)
14. [Critical & Adversarial Questions](#14-critical--adversarial-questions)
15. [Future Work](#15-future-work)

---

## 1. Project Overview & Motivation

---

**Q1. What is MAVEN and what problem does it solve?**

**A:** MAVEN (Multimodal Audio-Visual Examination Network) is a full-stack deepfake forensics platform that analyzes video content through three independent detection pipelines — frequency/visual artifact analysis, physiological liveness detection, and audio-visual lip-sync scoring — and returns a confidence-weighted verdict of REAL, FAKE, or UNCERTAIN with per-layer explainability.

The problem it solves is the inability to reliably distinguish AI-generated synthetic video from real video at inference time, at scale, and with explainability. Deepfakes now threaten personal reputation (non-consensual face swaps), political stability (fabricated politician videos), financial systems (identity fraud via KYC bypass), and judicial proceedings (tampered evidence). No single detection method reliably covers all generation techniques, so MAVEN exploits the fact that no deepfake generator simultaneously defeats all three detection vectors.

---

**Q2. Why use three detection layers instead of just one strong model?**

**A:** Because each deepfake generation technique leaves different forensic signatures. A GAN-generated face swap may have perfect lip sync but leave spectral artifacts and absence of a rPPG pulse. An audio dubbing attack has clean video but fails the sync check. A diffusion-generated face might fool spectral analysis but fail temporal coherence checks.

By requiring an adversary to defeat all three independent detection vectors simultaneously — spectral/visual, physiological, and audio-visual — adversarial evasion becomes exponentially harder than defeating any single detector. MAVEN's core insight is: **no single deepfake generator defeats all three vectors at once.**

---

**Q3. Who are MAVEN's target users?**

**A:**
- **Journalists and fact-checkers** verifying viral video authenticity
- **Legal and forensics professionals** requiring evidence integrity certificates
- **Social media platforms** doing pre-publish content moderation
- **Enterprise security teams** verifying video-based KYC/identity claims
- **Researchers** benchmarking detection methodologies

---

**Q4. How is MAVEN different from existing solutions like Microsoft Video Authenticator or Sensity AI?**

**A:** Existing tools have critical gaps:

| Tool | Limitation |
|---|---|
| Microsoft Video Authenticator | No explainability, deprecated |
| Sensity AI | Enterprise-only, expensive, black-box |
| Intel FakeCatcher | Single-modality (rPPG only), no audio-visual check |
| Deepware Scanner | No API, no integration capability |
| Hive Moderation API | Purely visual, no audio correlation |

MAVEN's differentiation: (1) all three forensic layers in a single API call, (2) per-segment timeline explainability showing *which time window* is suspicious, (3) physiological liveness integrated with spectral and sync analysis, (4) fully open-source and self-hostable, (5) structured confidence breakdown per detection axis — not a black box.

---

**Q5. What real-world incidents justify building MAVEN?**

**A:** 
- In 2024, a deepfake video of a Hong Kong bank employee was used to defraud **$25M USD** via a video conference call.
- Synthetic political deepfakes surfaced during national elections in India, USA, and Bangladesh in 2024.
- Synthetic voice/video fraud is the fastest-growing attack vector in KYC bypasses.
- Courts in multiple jurisdictions have begun rejecting video evidence without authenticity certificates.

---

## 2. System Architecture

---

**Q6. Describe the high-level architecture of MAVEN.**

**A:** MAVEN uses a **polyglot microservices architecture** with five primary components:

```
User (Browser)
     ↓ HTTPS
Nginx (Reverse Proxy :80)
     ↓ /api/* → backend:4000  |  /* → frontend:5173
Node.js/Express Backend (orchestrator)
     ↓ Supabase SDK          ↓ Internal HTTP (Docker network)
Supabase (PostgreSQL        FFT Service :8001  |  Liveness :8002  |  LipSync :8003
 + Auth + Storage           (ViT + DFDC)       (CHROM + EAR)      (Wav2Lip SyncNet)
 + Realtime)
```

The backend is purely an **I/O orchestrator** — it fans out to three Python ML microservices in parallel using `Promise.all()`, aggregates their scores, persists to Supabase, and pushes the result to the frontend via Socket.io.

---

**Q7. Walk me through the complete request flow for a video analysis submission.**

**A:**
1. User selects a video on `/analyze` → React sends `multipart/form-data POST /api/analysis/submit` with Supabase JWT.
2. `requireAuth` middleware validates the JWT via `supabase.auth.getUser(token)`.
3. Multer `memoryStorage` buffers the file entirely in RAM (never written to disk).
4. `analysis.controller.js`: upserts user profile → uploads buffer to Supabase Storage `maven-videos` bucket → generates a 1-hour signed URL → inserts `analysis_jobs` row (status=PROCESSING) → returns HTTP **202** `{ jobId }` immediately.
5. `runMLAnalysis(signedUrl, jobId)` is called **asynchronously** (fire-and-forget).
6. The orchestrator fires three parallel HTTP calls via `Promise.all()` to all Python services — all receive the same signed URL.
7. Each Python service: downloads the video → runs its ML pipeline → deletes the temp file in `finally` → returns JSON scores.
8. `computeFinalVerdict()` in `aggregator.js` fuses 4 signals (FFT + liveness + lipsync + temporal) into a final verdict.
9. Result written to `analysis_results`; job status updated to COMPLETED in `analysis_jobs`.
10. Socket.io emits `analysis_complete` to room `job:{jobId}`.
11. Supabase Realtime publishes CDC UPDATE on `analysis_jobs` (~100–500ms later as confirmation).
12. React navigates to `/result/:jobId` → fetches `GET /api/analysis/jobs/:id` → renders full result.

---

**Q8. Why does the backend return HTTP 202 before analysis is complete?**

**A:** Because ML analysis takes 20–35 seconds — far too long to hold a synchronous HTTP connection open. The **async job pattern** is the correct design for long-running operations:
1. Submit returns immediately with `jobId`.
2. Client subscribes to `job:{jobId}` Socket.io room for push notification.
3. Fetches the result once notified.

This decouples the submission latency (HTTP roundtrip ~200ms) from the processing latency (20–35s), providing a far better user experience and avoiding HTTP timeout issues.

---

**Q9. Why are both Socket.io AND Supabase Realtime used for push notifications?**

**A:** They serve different roles:
- **Socket.io (primary):** Fires immediately from the Node.js process when `saveAnalysisResult()` completes. Latency ~10ms. Room-based (`job:{jobId}`) so only the submitting user gets the event.
- **Supabase Realtime (secondary/confirmation):** Postgres CDC propagates the UPDATE on `analysis_jobs`. Arrives ~100–500ms after Socket.io. Serves as a reliable fallback if the WebSocket connection drops.

For UX: Socket.io fires first. Supabase Realtime provides a persistence-backed confirmation. This dual mechanism means the frontend is notified even if the Socket.io connection was temporarily interrupted during the analysis.

---

**Q10. What is the difference between how the three Python services receive the video?**

**A:** All three services receive the **same Supabase signed URL** but with different field names matching each service's Pydantic schema:
- **FFT service:** `{ video_path: signedUrl, max_frames: 15 }` — accepts URL or local path (detects via `startswith("http")`).
- **Liveness service:** `{ video_url: signedUrl, job_id: jobId }` — URL only.
- **LipSync service:** `{ video_url: signedUrl, job_id: jobId }` — URL only.

Each service independently downloads the video to a local temp file, runs inference, and deletes the temp file unconditionally in a `finally` block. This means the same video is downloaded **three times** — a known latency and bandwidth bottleneck.

---

## 3. ML Layer 1 — FFT & Visual Analysis

---

**Q11. What does the FFT service actually detect?**

**A:** The FFT service runs a **dual-model pipeline** with 6 complementary signals:

1. **ViT classifier (dima806):** `deepfake_vs_real_image_detection` from HuggingFace — frame-by-frame fake probability on face crops.
2. **DFDC EfficientNet B7 NS (selimsef):** Kaggle DFDC competition winner — 20 sampled frames with Test-Time Augmentation (horizontal flip), trimmed mean aggregation.
3. **Spectral analysis (2D FFT):** `compute_spectral_fake_score()` — high-frequency artifact detection. GAN/diffusion models leave anomalous high-frequency noise patterns in the spectral domain.
4. **Color consistency:** `compute_color_mismatch_score()` — face vs. background color distribution mismatch. Deepfake face blending often leaves color temperature inconsistency.
5. **Texture heuristic:** Laplacian variance + Sobel gradient smoothness — AI-generated faces are typically over-smoothed compared to natural skin texture.
6. **Temporal consistency:** Cosine similarity between consecutive ViT `[CLS]` token embeddings — real faces maintain consistent identity across frames; deepfakes flicker.

---

**Q12. Why is the DFDC EfficientNet used as the "anchor model" rather than the ViT?**

**A:** The DFDC EfficientNet B7 NS was trained specifically on the Deepfake Detection Challenge dataset — real manipulated face-swap videos. It has learned the actual statistical fingerprints of face-swapping, not general image quality artifacts.

Critically, it produces **near-zero scores (0.005–0.02) on any real video** regardless of compression. This makes it an extremely reliable "REAL" anchor.

The dima806 ViT model, by contrast, scores **50–56% fake probability on perfectly real mobile-compressed (H.265) video** due to compression artifacts that superficially resemble AI smoothing. Using ViT as the anchor would result in systematic false positives on any compressed real video.

The DFDC model is therefore used as the primary trusted signal; the ViT provides secondary confirmation.

---

**Q13. How is the ViT model's compression bias corrected?**

**A:** Via **piecewise linear calibration**:
- Inputs in `[0, 0.58]` → mapped to `[0, 0.42]` (compresses the ambiguous zone toward "real")
- Inputs in `[0.58, 1.0]` → mapped to `[0.42, 1.0]` (preserves genuine fake signals)

This corrects for the systematic ~50–56% false-positive bias on H.265-compressed real video, preventing the ViT from degrading the anchor DFDC signal.

---

**Q14. What happens when the DFDC and ViT models disagree?**

**A:** The aggregator handles four disagreement states:

| State | Behaviour |
|---|---|
| DFDC REAL + ViT REAL | Trust both — standard real blend |
| DFDC FAKE + ViT FAKE | Trust both — standard fake blend |
| DFDC REAL + ViT FAKE | **Trust DFDC** — ViT has compression bias |
| DFDC ≈ 0 + ViT FAKE | **Elevate ViT** — DFDC is out-of-domain (diffusion content) |

The fourth case is critical for **modern diffusion-based generators** (Sora, Kling, Veo) that the DFDC model (trained on 2020-era face-swaps) has never seen. When DFDC produces near-zero output AND ViT produces elevated scores, the aggregator correctly infers that DFDC has no meaningful opinion and elevates the ViT signal.

---

**Q15. What is the `SpectralCNN` in `models/cnn_classifier.py`, and is it used?**

**A:** `SpectralCNN` is a Conv2d architecture trained on 256×256 log-magnitude FFT spectral maps. A `bootstrap_cnn_weights.py` script exists to generate synthetic bootstrap weights.

**It is NOT part of the active inference pipeline.** It was developed as a baseline during the early exploration phase. The active pipeline uses the ViT + DFDC EfficientNet dual-model approach described above. This should be disclosed honestly to evaluators — the `cnn_classifier.py` file exists in the codebase but is not used in production inference.

---

**Q16. What is the temporal consistency analysis and how is it computed?**

**A:** The ViT `[CLS]` token is a 768-dimensional embedding representing the model's high-level representation of each face frame. For a real video, consecutive frames of the same face produce highly similar embeddings (cosine similarity > 0.9). Deepfakes can exhibit **temporal flickering** — the face identity subtly shifts between frames due to imperfect generation consistency.

MAVEN extracts the `[CLS]` embedding for each frame simultaneously with the classification forward pass, then computes **sliding-window cosine similarity** between consecutive embeddings. Output:
- `temporal_consistency_score`: mean window similarity [0=inconsistent/fake, 1=consistent/real]
- `jitter_score`: variance of window scores — high variance indicates irregular temporal flickering
- `worst_window`: the time segment with the lowest consistency score

---

## 4. ML Layer 2 — Physiological Liveness (rPPG + Blink)

---

**Q17. What is rPPG and why does it detect deepfakes?**

**A:** Remote PhotoPlethysmoGraphy (rPPG) estimates blood pulse rate from video by analysing subtle periodic color variations in skin. Blood circulation causes ~0.1–0.5% variation in RGB pixel values of the forehead and cheeks at 0.75–3.0 Hz (45–180 BPM).

**Real human faces** show this variation — a detectable pulse waveform.  
**AI-generated faces** render static skin texture without this physiological signal — they produce either no dominant frequency in the 0.75–3.0 Hz band, or random noise without a coherent pulse waveform.

MAVEN uses the CHROM algorithm and goes beyond basic implementations by extracting rPPG from **three independent skin regions** simultaneously.

---

**Q18. What makes MAVEN's rPPG implementation stronger than a basic single-region approach?**

**A:** Three enhancements beyond single-region CHROM:

1. **Multi-region extraction:** Three ROIs simultaneously — forehead (landmarks `[10, 338, 297, 332, 284, 251, 389]`), left cheek, and right cheek — providing three independent signal channels.

2. **Cross-correlation scoring:** Real heartbeats appear in all three regions simultaneously (blood circulates synchronously). Deepfake noise, by contrast, is uncorrelated between regions. High Pearson cross-correlation between region signals strongly indicates a real pulse.

3. **Harmonic verification:** Real cardiac pulse waveforms are non-sinusoidal and exhibit a 2nd harmonic peak (at 2× dominant frequency). A check verifies harmonic peak ≥ 15% of fundamental amplitude — adding another layer that frequency-spoofing attacks would need to replicate.

Final quality score: `0.50 × best_SNR_quality + 0.30 × cross_correlation + 0.20 × harmonic_bonus`

---

**Q19. Explain the CHROM algorithm used in the rPPG pipeline.**

**A:** CHROM (De Haan 2013) decomposes the RGB time series into a rPPG signal by removing specular reflection interference:

```
Xs = 3R - 2G
Ys = 1.5R + G - 1.5B
rPPG = Xs - (σ_Xs / σ_Ys) × Ys
```

The `σ` ratio eliminates specular reflection noise (which affects R and G identically). The resulting `rPPG` signal is then:
- Bandpass filtered (3rd-order Butterworth, 0.75–3.0 Hz) to isolate physiologically plausible heart rates
- FFT-analysed to find the dominant frequency → converted to BPM
- SNR-scored: `min(1.0, peak_amplitude / mean_amplitude / 10.0)`

A minimum of **100 frames (~4 seconds at 25fps)** is required for reliable HR estimation.

---

**Q20. Explain the Eye Aspect Ratio formula and how it detects blink anomalies in deepfakes.**

**A:** `EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)`

The 6 landmark points form the eye boundary: p1/p4 are the horizontal corners; p2/p3 are upper lid points; p5/p6 are lower lid points. When the eye is open, vertical distances are large and EAR > 0.20. When blinking, vertical distances collapse → EAR drops below 0.20 for ≥2 consecutive frames.

Early deepfake generators didn't model natural blink dynamics — resulting in unnaturally infrequent, irregular, or absent blinking.

MAVEN's blink detector scores **four sub-metrics** beyond simple blink count:
- **Regularity:** Natural inter-blink interval variability
- **IBI score:** Inter-blink interval consistency
- **Duration score:** Normal blinks last 100–400ms
- **Waveform score:** Smooth EAR curve shape (real blinks have a characteristic smooth dip; fake blinks may be abrupt)

---

**Q21. What are the failure modes of rPPG-based liveness detection?**

**A:**

1. **Glasses/occlusion:** Lens reflections distort forehead ROI pixel values, corrupting the signal. Mitigation: drop ROIs with high reflection artifact scores; use additional ROIs.

2. **Head motion artifacts:** Rapid head movement introduces non-physiological signal changes. Mitigation: filter frames with excessive landmark displacement between consecutive frames.

3. **Heavy compression:** H.264 at low bitrate introduces DCT block artifacts that corrupt the subtle ~0.1% color variations of pulse. Mitigation: apply input quality threshold before attempting rPPG analysis.

4. **Adversarial generators trained with rPPG loss:** Future generators could include rPPG consistency as a training objective. MAVEN's cross-correlation + harmonic verification adds robustness, but pulse wave morphology validation would be the next defense step.

5. **Short clips (<4 seconds):** Returns `signal_quality=0.1`, `pulse_present=False` — liveness signal effectively zero. The aggregator weights this at near-zero accordingly.

---

**Q22. How is the final liveness score computed from rPPG and blink sub-scores?**

**A:** In `liveness_service/main.py`:

```python
rppg_score = rppg["signal_quality"] if rppg["pulse_present"] else 0.15
blink_score = blink["regularity_score"]
liveness_score = 0.70 × rppg_score + 0.30 × blink_score
```

Plus two floor adjustments:
- **Strong pulse boost:** If `pulse_present=True` AND `signal_quality > 0.8` → `liveness_score = max(liveness_score, 0.65)`
- **Cross-correlation boost:** If `pulse_present=True` AND `cross_correlation > 0.75` → `liveness_score = max(liveness_score, 0.70)`

The rPPG signal carries 70% weight because it is a direct physiological measurement, while blink regularity (30%) is a secondary behavioral signal that can be absent in profile-view or non-talking videos.

---

## 5. ML Layer 3 — Audio-Visual Lip Sync

---

**Q23. What model does the LipSync service use, and what is it actually doing?**

**A:** Despite the file being named `cross_modal_transformer.py`, the architecture implemented is the **Wav2Lip SyncNet discriminator** (`SyncNet_color` class) — the exact Prajwal et al. (ACM MM 2020) design, not a custom transformer.

SyncNet takes:
- **Video input:** 5 consecutive RGB frames stacked on the channel dimension (5×3=15 channels), cropped to the lower half of the lip region (48×96 px)
- **Audio input:** 80-bin mel spectrogram slice, 16 time steps

Both are passed through separate Conv2d encoder chains → L2-normalized 512-dim embeddings → **cosine similarity** is the sync score per window. High similarity = audio and lip movement are synchronized.

---

**Q24. What is the sliding window inference strategy in the LipSync service?**

**A:** MAVEN processes the video with a **stride-1 sliding window of 5 frames**:

1. Compute 80-bin mel spectrogram from 16kHz mono audio (via FFmpeg extraction + librosa).
2. Extract 96×96 lip crops via MediaPipe Tasks API FaceLandmarker (30-point `LIP_OUTER` mask) per frame.
3. For each non-silent window (RMS ≥ 0.01):
   - Stack 5 consecutive lower-half lip crops → video tensor (15, 48, 96)
   - Resize corresponding mel slice → audio tensor (80, 16)
   - Check lip motion (static mouth during active speech → 40% score penalty)
   - SyncNet forward pass → cosine similarity → sigmoid → window score
4. Robust score aggregation: `0.50 × mean + 0.30 × p25 + 0.20 × median` (penalises brief good windows surrounded by bad ones)
5. Apply consecutive-bad-window penalty: ≥5 consecutive windows scoring < 0.30 AND > 5% of total windows → up to 0.08 additional penalty
6. Final weighted: `0.70 × robust_score + 0.30 × energy_weighted_score`

---

**Q25. Why are the SyncNet weights pre-trained for generation rather than detection? Is this a problem?**

**A:** The `lipsync_expert.pth` checkpoint was trained as part of the **Wav2Lip lip-sync generation system** — its objective was to maximize cosine similarity for synchronized audio-lip pairs. It was not fine-tuned for the detection task.

**Yes, this is a limitation.** The model works reasonably as a proxy discriminator because it genuinely measures audio-visual synchronization, but it would benefit from fine-tuning with:
- Positive pairs from real talking-head video
- Negative pairs from deepfake datasets (FakeAVCeleb, LAV-DF)
- Hard negatives: audio offset ±200ms (subtle desync)
- Contrastive detection-objective loss

The practical impact: the model may have a lower dynamic range on out-of-distribution dubbing attacks versus the attacks in the Wav2Lip training distribution.

---

**Q26. What happens when the LipSync weights file (`lipsync_expert.pth`) is not present?**

**A:** The service **gracefully degrades**: it runs with random weights and sets `weights_loaded=false` in its response. The aggregator detects this flag and treats the lipsync result as `INSUFFICIENT_DATA`, assigning it **0% weight** in the final fusion. The analysis proceeds using only FFT + liveness signals.

This is important to disclose: the lipsync signal is entirely absent from analysis until the weights are manually downloaded. The DFDC EfficientNet weights (~255MB) auto-download from GitHub releases on first use; the SyncNet weights require explicit setup.

---

## 6. Score Fusion & Aggregation

---

**Q27. Explain the full score aggregation pipeline in `aggregator.js`.**

**A:** Seven-step process:

**Step 1 — Unified fake probability scale [0=real, 1=fake]:**
```
fftFakeProb      = fftResult.artifact_score
livenessFakeProb = 1 - livenessResult.liveness_score
lipsyncFakeProb  = 1 - lipsyncResult.sync_score
temporalFakeProb = 1 - fftResult.temporal_consistency.temporal_consistency_score
```

**Step 2 — Dynamic base weights** (6 cases based on data availability of temporal and lipsync signals, e.g., when lipsync has no data: fft=0.70, liveness=0.30, lipsync=0.00, temporal=0.00)

**Step 3 — Confidence boosting:** Each model's weight is scaled by its distance from neutral:
```
confidence_i = |score_i - 0.5| × 2
adj_weight_i = base_weight_i × (1.0 + 0.30 × confidence_i)
# Weights renormalized to sum to 1.0
```

**Step 4 — Model agreement scoring:**
- 3+ models leaning fake (>0.55) → +0.08
- 2+ models leaning fake → +0.04
- 1 fake + 2+ real → -0.06

**Step 5 — Contextual boosts:**
- FFT uncertain + LipSync UNCERTAIN → +0.06
- Suspicious frames ≥ 95% → +0.08
- Temporal consistency < 0.4 → +0.05
- Temporal jitter > 0.6 → +0.04

**Step 6 — Verdict thresholds:**
```
finalFakeProb < 0.40 → "REAL"
finalFakeProb > 0.60 → "FAKE"
else                 → "UNCERTAIN"
```

**Step 7 — Hard overrides:**
- FFT > 0.65 AND LipSync > 0.55 → force FAKE
- 3+ models lean fake AND finalFakeProb > 0.50 → force FAKE
- FFT < 0.25 AND liveness < 0.25 AND lipsync < 0.35 → force REAL
- 3+ models lean real AND finalFakeProb < 0.45 → force REAL

---

**Q28. Why does liveness get a lower weight (0.15–0.30) compared to FFT (0.35–0.70)?**

**A:** Two practical reasons:

1. **Data quality dependency:** rPPG requires ≥100 frames (~4s) of a mostly forward-facing, well-lit face. Many short clips, profile shots, or poorly-lit videos yield `signal_quality=0.1` and `pulse_present=False`, making liveness uninformative. When liveness is unreliable, giving it low weight is the correct statistical decision.

2. **DFDC reliability:** The EfficientNet B7 NS anchor is rigorously validated on competition data and near-zero on all real video. It is the most reliable single signal available.

Importantly, the aggregator compensates via the **floor adjustments in `main.py`**: when liveness HAS high-quality data (strong cross-correlation > 0.75 + harmonic present), the liveness score is floored at 0.65–0.70, which then propagates as a strong signal into the aggregator regardless of its weight fraction.

---

**Q29. Why is the UNCERTAIN verdict band set as a range (0.40–0.60) rather than a single threshold?**

**A:** A binary verdict at a single threshold (e.g., >0.50 = FAKE) would force the system to commit in cases where it genuinely lacks sufficient confidence. This is epistemically dishonest and practically harmful — a journalist acting on a spurious "FAKE" verdict based on borderline evidence is worse than receiving "UNCERTAIN" and knowing to seek additional verification.

The 0.40–0.60 band acknowledges the inherent uncertainty of the problem: compressed video, poor lighting, short clips, and out-of-distribution deepfake generators all produce ambiguous signals. UNCERTAIN is the correct output for ambiguous inputs.

---

**Q30. What is the consistency guarantee between the two database writes for job completion?**

**A:** Currently **weak** — there is no transaction wrapping the `INSERT INTO analysis_results` and `UPDATE analysis_jobs SET status=COMPLETED`. If the Node.js process crashes between these two writes, a job could show COMPLETED with no corresponding result row, causing a frontend crash on result fetch.

The correct fix is to wrap both writes in a **Supabase RPC function** (PostgreSQL stored procedure) so both statements execute in a single ACID transaction. This is identified as a correctness gap in the project's critical review.

---

## 7. Backend Engineering

---

**Q31. Why was Node.js chosen as the backend orchestrator rather than Python or Go?**

**A:** The backend's primary role is **I/O orchestration** — fanning out to 3 Python services in parallel, aggregating results, and writing to Supabase. This is a workload dominated by I/O wait, not CPU computation. Node.js's event-loop model with `Promise.all()` is precisely optimised for this fan-out pattern.

Why not Python FastAPI for everything? Python's GIL limits true parallelism for I/O-heavy fan-out. Why not Go? Go would handle the concurrency equally well, but language switching adds overhead for a solo developer, and the Express middleware ecosystem (Multer, Supabase SDK, Socket.io) is purpose-built for this exact use case.

---

**Q32. Why does Multer use `memoryStorage` instead of `diskStorage`?**

**A:** `memoryStorage` keeps the uploaded video bytes in RAM as a Buffer, available immediately for streaming to Supabase Storage. Benefits:
- No disk I/O on the Node.js server
- No temporary file cleanup required
- Cleaner code path

Tradeoff: 100MB upload = 100MB heap allocation. At 10 concurrent 100MB uploads = 1GB heap. This is acceptable at demo scale (<5 concurrent uploads) but would require switching to streaming upload (piping directly to Supabase without buffering) at production scale.

---

**Q33. How does the `requireAuth` middleware work, and why not decode the JWT locally?**

**A:** `requireAuth` extracts the Bearer token from the `Authorization` header and calls `supabase.auth.getUser(token)`. On success, the full Supabase user object (including `id`, `email`, `user_metadata`) is attached to `req.user` for downstream controller use.

**Why not decode locally?** Local JWT verification requires securely storing the JWT secret and handling token refresh edge cases. More critically, locally decoded tokens cannot detect **revocation** — a user who changes their password would still have a technically valid (but revoked) JWT. Delegating to `supabase.auth.getUser()` ensures revoked tokens are correctly rejected by Supabase's auth service.

---

**Q34. What is the `ensureUserProfile()` pattern and why is it needed?**

**A:** Before creating an analysis job, the backend calls `ensureUserProfile(user)` which `upsert`s a row in `public.users` using the **service role key** (bypassing RLS). This handles a race condition: users who signed up via the frontend Supabase client before the `auth.users` → `public.users` trigger was installed in Supabase would fail the foreign key constraint when creating an analysis job (since `analysis_jobs.user_id` references `public.users.id`).

By upsert-on-every-submission, the backend defensively ensures the profile row always exists, regardless of when the user signed up.

---

**Q35. What is the `socket.js` singleton pattern and why is it needed?**

**A:** The Socket.io server instance is created once at application startup in `socket.js` and exposed via `getIO()`. This singleton pattern makes the Socket.io instance available across all backend modules (particularly `mlOrchestrator.js`) without passing it as a parameter through every function call or creating circular module dependencies.

In `mlOrchestrator.js`: `getIO().to('job:{jobId}').emit('analysis_complete', {...})` fires when analysis completes. Without the singleton, importing the HTTP server or Socket.io instance into the orchestrator service would create a circular dependency chain.

---

**Q36. What is the critical production gap in the current backend architecture?**

**A:** The **absence of a durable job queue**. Currently, analysis runs as a `fire-and-forget` async operation via `.catch()`. If the Node.js process crashes mid-analysis, the job remains in `PROCESSING` status permanently with no recovery path.

The correct production architecture uses **BullMQ + Redis**:
- The orchestrator enqueues a job payload to Redis
- A worker process consumes from the queue and runs the analysis
- Jobs survive orchestrator crashes (Redis persists them)
- Retry logic, dead-letter queues, and fair scheduling become possible
- Queue depth can be monitored as a scaling metric for the ML services

---

## 8. Database Design & Security

---

**Q37. Why is PostgreSQL (via Supabase) the right database for MAVEN?**

**A:** The data model has clear relational structure: each user has many jobs; each job has exactly one result; results reference jobs via foreign key. PostgreSQL provides:

1. **Strong consistency** for job status updates — critical for correctness (PROCESSING → COMPLETED transition must be atomic)
2. **JSONB column** for the `details` field — stores full per-service JSON payloads without schema migration when ML service outputs evolve
3. **Row Level Security (RLS)** enforced at the database layer — user data isolation even if the Express layer has an IDOR bug
4. **Built-in Realtime CDC** via Supabase's Postgres replication — no additional pub/sub infrastructure needed

---

**Q38. Explain MAVEN's Row Level Security (RLS) policies and why they matter.**

**A:** Three RLS policies enforce strict data isolation:

```sql
-- Users can only see their own profile
CREATE POLICY "Users can only access their own profile"
ON users FOR ALL USING (auth.uid() = id);

-- Users can only see their own jobs
CREATE POLICY "Users can only access their own jobs"
ON analysis_jobs FOR ALL USING (auth.uid() = user_id);

-- Users can only see results for their own jobs
CREATE POLICY "Users can access results for their jobs"
ON analysis_results FOR ALL USING (
  EXISTS (SELECT 1 FROM analysis_jobs
          WHERE analysis_jobs.id = analysis_results.job_id
          AND analysis_jobs.user_id = auth.uid())
);
```

**Why they matter:** Defense-in-depth. Even if an attacker finds an IDOR vulnerability in the Express API (e.g., a missing `user_id` check in a controller), the database layer refuses to return any unauthorized rows. The application layer and the database layer must *both* be compromised for a data breach to occur.

---

**Q39. Why is the `maven-videos` storage bucket private, and how do Python services access it?**

**A:** The bucket is private to prevent unauthorized parties from accessing users' video content directly. No public URL exists.

Python services access video files via **1-hour signed URLs** generated by the Node.js backend at job creation time. These URLs are:
- Stored in `analysis_jobs.video_path` (intentional — Python services need to download the video using this URL)
- Valid for exactly 1 hour (TTL)
- Generated with Supabase Storage's `createSignedUrl()` using the service role key

The Python services receive only the signed URL; they never have direct bucket access credentials.

---

**Q40. What is a significant correctness issue with storing the signed URL in `video_path`?**

**A:** Signed URLs expire after 1 hour. If a user views an analysis job more than 1 hour after submission, the `video_path` field contains an expired URL. Any future operation requiring video re-download (e.g., re-running analysis, adding a new detection layer) would fail silently.

The **correct design** is to store the **raw storage path** (e.g., `maven-videos/user-id/timestamp-filename.mp4`) and generate a fresh signed URL **on demand** at query time. The current design is a functional correctness issue for long-lived jobs.

---

**Q41. What are the major security gaps in the current implementation?**

**A:**

| Gap | Risk | Fix |
|---|---|---|
| No rate limiting on `/api/analysis/submit` | Resource exhaustion — single user can flood GPU capacity | `express-rate-limit` middleware |
| Wildcard CORS (`allow_origins=["*"]`) in Python services | Cross-origin requests from any domain | Restrict to known frontend origin |
| No internal service authentication | Any process reaching Docker network can call ML services | Shared internal token (`X-Internal-Token`) |
| Signed URL stored in DB (1h TTL) | Expired URL causes re-analysis to fail | Store raw path, generate URL on demand |
| No CSP headers | XSS attack surface | Add `Content-Security-Policy` response headers |

---

## 9. Frontend & User Experience

---

**Q42. What are the actual active routes in the React frontend?**

**A:** Five active routes (from `App.jsx`):

| Route | Component | Auth Required |
|---|---|---|
| `/` | `Home.jsx` | No |
| `/auth` | `Auth.jsx` | No |
| `/analyze` | `Analyze.jsx` | Yes |
| `/library` | `Library.jsx` | Yes |
| `/result/:jobId` | `Result.jsx` | Yes |

Legacy redirects: `/upload` → `/analyze`, `/dashboard` → `/library`.

Note: `Dashboard.jsx`, `ForensicDashboard.jsx`, and `Upload.jsx` exist in the `pages/` directory as earlier iterations but are not active routes.

---

**Q43. How does the frontend know when analysis is complete?**

**A:** Dual mechanism:

1. **Socket.io (primary):** On `/analyze`, the frontend subscribes to room `job:{jobId}` via `socket.io-client`. When analysis completes, the backend emits `analysis_complete` → frontend receives the event immediately (~10ms latency) and navigates to `/result/:jobId`.

2. **Supabase Realtime (secondary):** The frontend also subscribes to `postgres_changes` on `analysis_jobs WHERE id=eq.{jobId}` via `useRealtime.js`. This fires when the DB row is updated (~100–500ms after Socket.io) and serves as a reliable fallback if the Socket.io connection dropped.

---

**Q44. What state management approach does the frontend use, and why no Redux/Zustand?**

**A:** No global state library. State is distributed:
- **Auth state:** Supabase `onAuthStateChange` in `AuthContext`
- **Theme:** `ThemeContext` with dark/light toggle
- **Job list:** Local state in `Library.jsx`
- **Real-time status:** Socket.io subscription local to `Analyze.jsx`
- **Analysis result:** Local state in `Result.jsx`, fetched from GET API

**Why no Redux?** The application data flow is linear — there is no shared mutable state across sibling components that requires a centralized store. Auth state flows down from `AuthContext`; job/result data is page-scoped. Adding Redux would be over-engineering for this component graph.

---

**Q45. What is the `ProtectedRoute` component and how does it work?**

**A:** `ProtectedRoute` is a wrapper component that reads the Supabase session from `AuthContext`. If the user is not authenticated (no active session), it renders a `<Navigate to="/auth" />` redirect. If authenticated, it renders the child component normally.

This prevents unauthenticated access to `/analyze`, `/library`, and `/result/:jobId` — all routes that require a user account and whose data is user-specific.

---

**Q46. What UX improvement would most meaningfully improve the user experience during a 20–35 second analysis wait?**

**A:** A **real-time progress indicator** showing which detection layers have completed. Currently, the user receives a single "Analysis started" message and waits with no feedback until `analysis_complete` fires. 

Ideal implementation: each Python service emits a progress event to the Node.js orchestrator as it completes (`fft_complete`, `liveness_complete`, `lipsync_complete`). The orchestrator emits these intermediate events via Socket.io, and the frontend renders a step-by-step progress card:
- ✅ FFT & Visual Analysis (completed in 8s)
- ✅ Physiological Liveness (completed in 12s)  
- ⏳ Lip Sync Analysis (in progress…)

This reduces perceived wait time significantly, makes the multi-layer architecture visible to the user, and builds trust in the system's process.

---

**Q47. Evaluate the UX quality of MAVEN's result page.**

**A:** 
**Strengths:**
- Three-tier verdict (REAL/UNCERTAIN/FAKE) is more honest than binary — users understand when the system is unsure
- Score breakdown per detection layer (via Recharts charts) provides genuine explainability
- Real-time delivery (Socket.io push) feels responsive
- `SyncTimeline.jsx` showing per-second sync score gives temporal context

**Gaps:**
- No per-frame heatmap (GradCAM) visualization showing *which facial region* triggered the fake classification
- No progress indicator during the 20–35s wait — blank state is frustrating
- No error recovery UI for analyses that fail or for expired signed URL scenarios
- No ability to re-submit the same video for re-analysis without re-uploading
- Confidence percentage without calibration explanation may mislead less technical users

---

**Q48. What CSS framework does MAVEN's frontend use?**

**A:** **TailwindCSS v3** (devDependency `tailwindcss: ^3.4.3`) with PostCSS configured via `tailwind.config.js` and `postcss.config.js`. This is **not vanilla CSS** — earlier documentation versions incorrectly claimed vanilla CSS.

Additional UI libraries:
- **Framer Motion** (`^11.1.7`) — page/component animations
- **lucide-react** (`^1.8.0`) — icon set
- **Recharts** (`^2.12.4`) — score visualization (radar/bar/line charts)
- **clsx** (`^2.1.1`) — conditional class merging
- **date-fns** (`^4.1.0`) — date formatting on job history

---

## 10. Performance Engineering

---

**Q49. What are the primary performance bottlenecks in the current implementation?**

**A:**

| Bottleneck | CPU Estimate | Root Cause |
|---|---|---|
| ViT inference (15 frames) | ~4.5s | ~300ms/frame on CPU |
| DFDC EfficientNet (20 frames + TTA) | ~6s | ~150ms/frame × 2 (flip) |
| MediaPipe liveness (all frames, 750 for 30s) | ~3–5s | Dense frame processing |
| Wav2Lip SyncNet (stride-1 sliding window) | ~10–20s | Per-window forward pass |
| Triple video download | +3–15s | Each service downloads independently |
| Multer memoryStorage (100MB upload) | 100MB heap | No streaming to Supabase |

LipSync is the critical path — it determines overall analysis latency.

---

**Q50. How would you reduce analysis latency from ~35s to <10s?**

**A:** Four levers:

1. **GPU inference:** Migrate to NVIDIA T4 GPU instance. ViT and DFDC EfficientNet batch inference on GPU would reduce their combined time from ~10s to <1s. SyncNet on GPU drops from ~15s to <3s.

2. **Shared video file:** Download the video once to a Docker shared volume; all three services read from the same local file. Eliminates 2 redundant downloads (~6–10s saved).

3. **ONNX + TensorRT export:** Export DFDC and SyncNet to ONNX → TensorRT INT8 quantization → 2–4× throughput improvement per model.

4. **Tiered inference:** Run FFT first (~5s). If FFT score < 0.15 (clearly real), skip LipSync entirely — save ~15s for obvious real videos. Only run expensive LipSync when FFT is ambiguous or fake-leaning.

---

**Q51. What is the DFDC weights auto-download issue and how should it be fixed?**

**A:** The DFDC EfficientNet B7 NS weights (~255MB) are auto-downloaded from GitHub releases **on the first analysis request**. This means the first user to submit a video after a fresh deployment will experience a ~30–120s (depending on network speed) delay just for weight download, before any inference begins.

**Fix:** Pre-download model weights during the **Docker image build step**:
```dockerfile
RUN python -c "from selimsef_predictor import DeepFakeClassifier; DeepFakeClassifier()"
```
This bakes the weights into the image layer, so startup has no download latency.

---

## 11. Scalability

---

**Q52. What is the biggest architectural obstacle to scaling MAVEN to 500 concurrent analysis jobs?**

**A:** The **absence of a job queue and the synchronous HTTP fan-out pattern**. 

Currently: Node.js → `Promise.all(3 HTTP calls)` directly to Python services. At 500 concurrent jobs, all three services receive 500 simultaneous requests. Each LipSync analysis occupies ~15–20s of CPU time. A single LipSync instance handles ~3 concurrent requests at best. The other 497 requests time out or fail.

**Solution:** Replace direct HTTP fan-out with **BullMQ + Redis**. The orchestrator enqueues a job; LipSync workers consume from the queue at their own rate. Queue depth becomes a natural back-pressure mechanism. This also enables:
- Per-service independent scaling
- GPU auto-scaling based on queue depth metric
- Retry logic for transient ML failures
- Graceful handling of orchestrator restarts

---

**Q53. How would Socket.io scale across multiple Node.js backend instances?**

**A:** Socket.io by default uses in-process memory for room management. If two Node.js instances are deployed behind a load balancer, an `analysis_complete` event emitted by Instance A won't reach a client connected to Instance B.

**Fix:** Add the **Socket.io Redis Pub/Sub adapter** (`@socket.io/redis-adapter`). All instances subscribe to the same Redis channel; any instance emitting to a room has the event fanned out to all instances, which deliver it to the connected client. This is a standard horizontal scaling pattern for WebSocket servers.

---

**Q54. At what scale would Supabase Realtime become a bottleneck?**

**A:** Supabase Realtime on the free tier has concurrent WebSocket connection limits. At ~100+ simultaneous users each holding a Realtime subscription, the free tier limit may be hit.

Mitigations:
1. Upgrade to paid Supabase tier (Pro+ plan increases connection limits)
2. Rely more on Socket.io for notifications (which doesn't have the same SaaS limits)
3. Self-host Supabase at very high scale (thousands of concurrent users)

For a portfolio demo, the free tier is sufficient. This becomes a concern only at production scale.

---

## 12. Technology Tradeoffs

---

**Q55. Justify the choice of Supabase over a custom PostgreSQL + S3 + Auth0 stack.**

**A:** MAVEN needs four infrastructure pieces: user auth, video file storage, relational job/result storage, and real-time push to the frontend. Supabase provides all four with:
- A single SDK in the frontend for auth + realtime
- Row Level Security baked into PostgreSQL (not a separate service)
- Managed infrastructure with zero-ops overhead for a solo developer
- Free tier sufficient for development and demo

The alternative (PostgreSQL + AWS S3 + Auth0 + Redis Pub/Sub) would require:
- 4 separate vendor configurations
- 2 separate SDKs in the frontend
- Manual JWT verification middleware
- A separate service for real-time push

**Trade-offs of Supabase:** Vendor lock-in on the Realtime architecture. At very high scale, self-hosted PostgreSQL + S3 would be cheaper. For a portfolio project, Supabase is the clearly correct decision.

---

**Q56. Why FastAPI over Flask for the Python ML microservices?**

**A:** Three advantages:

1. **ASGI-native async** via Uvicorn — handles concurrent requests without a WSGI thread-per-request model, important when multiple parallel analysis jobs hit the same service instance.
2. **Pydantic request validation** — `video_url` input is validated before reaching the ML pipeline. Flask requires manual validation.
3. **Automatic Swagger docs at `/docs`** — invaluable during development for testing ML service endpoints directly without needing the full frontend stack.

Flask would work but produces more boilerplate for the same functionality in an async-first ML inference context.

---

**Q57. Why was dynamic confidence-weighted aggregation chosen over simple fixed weights?**

**A:** Fixed weights (e.g., `{ fft: 0.30, liveness: 0.40, lipsync: 0.30 }`) fail in two common scenarios:

1. **No speech in video:** A fixed 30% lipsync weight would dilute genuine FFT/liveness fake signals with a neutral ~0.5 lipsync score (since no speech → no data). Dynamic aggregation drops lipsync weight to 0% when `weights_loaded=false` or `verdict=NO_SPEECH_DETECTED`.

2. **Low signal quality:** When rPPG quality is 0.1 (short clip, poor lighting), a fixed 40% liveness weight degrades the verdict with essentially noise. Dynamic weighting scales the liveness weight proportionally to confidence distance from 0.5.

The dynamic approach is more complex but fundamentally more correct — signal weights should reflect signal quality, not be fixed constants.

---

## 13. DevOps & Deployment

---

**Q58. What is the current state of the Docker Compose setup?**

**A:** The `docker-compose.yml` file in the repository is currently **empty**. The Docker orchestration described in the documentation is the intended production design, not the current operational state.

During development, each service runs independently:
```bash
cd ml-services/fft_service && .venv/bin/uvicorn main:app --reload --port 8001
cd ml-services/liveness_service && .venv/bin/uvicorn main:app --reload --port 8002
cd ml-services/lipsync_service && .venv/bin/uvicorn main:app --reload --port 8003
cd backend && npm run dev
cd frontend && npm run dev
```

This is a known gap — the full system cannot be started with `docker-compose up` in its current state.

---

**Q59. Why is `numpy==1.26.4` pinned across all Python services?**

**A:** This is a **critical ABI compatibility constraint**. NumPy 2.x introduced breaking binary interface changes that break:
- PyTorch (compiled against NumPy 1.x C API)
- MediaPipe (pre-built wheels compiled against NumPy 1.x)
- HuggingFace Transformers

Additionally, Python 3.12 is required; Python 3.13+ lacks pre-built wheels for `mediapipe` and `pydantic-core`. These version pins ensure reproducible, working environments across all three Python services and must not be changed without re-validating the entire ML stack.

---

**Q60. What is the deployment target for each component?**

**A:**

| Component | Development | Production |
|---|---|---|
| Frontend | `http://localhost:5173` (Vite) | Vercel (auto-deploy from main) |
| Backend | `http://localhost:4000` (`node --watch`) | Railway or Render (Node.js container) |
| FFT Service | `.venv/bin/uvicorn :8001` | Modal.com or AWS EC2 (CPU) |
| Liveness Service | `.venv/bin/uvicorn :8002` | Modal.com or AWS EC2 (CPU/GPU) |
| LipSync Service | `.venv/bin/uvicorn :8003` | AWS EC2 GPU (NVIDIA T4) |
| Supabase | Managed (no local) | Managed (no self-hosting needed) |
| Nginx | Local container | Cloud container (same as backend) |

---

## 14. Critical & Adversarial Questions

---

**Q61. What is the most dangerous adversarial attack against MAVEN?**

**A:** A **rPPG-aware deepfake generator** — one that includes remote photoplethysmography consistency as a training loss objective. Such a generator would produce synthetic skin textures with plausible periodic color variation at physiologically correct frequencies, defeating the liveness layer.

Defense depth at that point shifts to:
- Pulse wave **morphology** validation (the shape of the cardiac waveform, not just its frequency)
- **Spatial inconsistency** — even if rPPG is replicated globally, fine-grained spatial variation (capillary-level pulse waves traveling through the face) may differ from real physiology
- Escalating to spectral and temporal signals as the primary vectors

This is an active research area — no current open-source generator implements rPPG-aware training, but it is a credible future threat vector.

---

**Q62. Can MAVEN detect deepfakes from Sora, Kling, or other modern diffusion-based video generators?**

**A:** Partially, with important caveats. The DFDC EfficientNet B7 NS was trained on 2020-era face-swap deepfakes (FaceSwap, DeepFaceLab, Neuraltalk style). It has **never seen diffusion-based generated content** and produces near-zero scores on it — effectively treating it as real. This is the **out-of-domain problem**.

MAVEN handles this via the disagreement path: when DFDC ≈ 0 AND ViT returns elevated scores → elevate ViT weight. The ViT (dima806) is a more general image quality classifier and may catch diffusion artifacts that face-swap-trained DFDC misses.

However, the honest answer is that **no current detector reliably handles the latest generation of diffusion-based generators** (Sora, Kling, Veo). This is an open research problem, not a MAVEN-specific limitation.

---

**Q63. A video is compressed to H.265 at very low bitrate before being submitted. Does MAVEN still work?**

**A:** Yes, with degraded confidence. The impacts per layer:

- **FFT/Visual:** Heavy compression introduces DCT blocking artifacts that can superficially resemble spectral artifacts. The DFDC EfficientNet is robust to this (near-zero on compressed real video). The ViT calibration was designed to correct for H.265 bias. Expected: slight inflation of ViT score, stable DFDC score.

- **rPPG (Liveness):** This is the most affected layer. Block compression corrupts the subtle ~0.1% color variations of pulse. At very low bitrate, `signal_quality` degrades significantly and `pulse_present` may be `False` for real video. The aggregator would drop liveness weight accordingly.

- **LipSync:** Mel spectrogram computation from audio is largely unaffected by video compression. Lip crop quality degrades with severe compression, potentially affecting SyncNet accuracy.

The three-tier verdict (REAL/UNCERTAIN/FAKE) correctly handles this: severely compressed video of a real person would likely return UNCERTAIN rather than incorrectly FAKE, reflecting the degraded confidence.

---

**Q64. If a user uploads a video of a static image (no motion, no speech), what does MAVEN output?**

**A:** Each layer gracefully degrades:

- **FFT/Visual:** The dual-model pipeline (ViT + DFDC) runs on sampled frames normally. If the "video" is just a still image looped, DFDC produces near-zero (looks like a real photo to the model). ViT may produce low scores. Temporal consistency would be very high (identical frames = identical embeddings). Expected: low artifact score → REAL-leaning.

- **rPPG:** No face motion → no rPPG signal extraction possible (MediaPipe may not find a face in a static image or detects but finds zero color variation). Returns `pulse_present=False`, `signal_quality=0.1`. Liveness essentially uninformative.

- **LipSync:** No audio or silent audio → `verdict=NO_SPEECH_DETECTED`. Zero weight in aggregator.

**Net result:** Aggregator relies almost entirely on FFT/Visual signals, with 0% liveness and 0% lipsync weight. This is correct — the system appropriately hedges on content it cannot evaluate physiologically or synchronically.

---

**Q65. If both DFDC and ViT are confident the video is REAL, but lipsync detects OUT_OF_SYNC, what happens?**

**A:** The aggregator handles this via Step 7 hard overrides:

- `FFT < 0.25 AND liveness < 0.25 AND lipsync < 0.35` → force REAL

If FFT is strong-real (< 0.25) and liveness is strong-real (< 0.25), this override fires regardless of lipsync. The UNCERTAIN band (0.40–0.60) would absorb mixed signals that don't meet override thresholds.

This is correct behaviour for cases like: a real video with a translation dub (real face, real rPPG, but voice doesn't match lip movement). The visual signals correctly identify it as a real person's face; the lipsync detects audio manipulation. The system would likely return UNCERTAIN, which is the honest answer — the face is real but the audio may have been replaced.

---

## 15. Future Work

---

**Q66. What is the single highest-impact improvement for production readiness?**

**A:** **Durable job queue with BullMQ + Redis.** Without it, any Node.js process crash between job submission and completion leaves jobs permanently stuck in PROCESSING. At scale, this becomes a reliability disaster — no retry, no recovery, no back-pressure management.

With a job queue:
- Jobs survive orchestrator crashes
- Retry logic handles transient ML service failures
- Queue depth can auto-scale ML service instances
- Fair scheduling prevents single users from monopolizing compute
- Dead-letter queues capture permanently failing jobs for inspection

This is P0 before any public deployment.

---

**Q67. What additional detection signal would most improve accuracy for modern deepfakes?**

**A:** **GAN fingerprinting** or **diffusion model noise pattern analysis**. Every generative model leaves a unique statistical fingerprint in its output due to model architecture and training data. Convolutional upsampling in GANs introduces periodic patterns in the Fourier domain; diffusion models leave characteristic noise patterns from their denoising schedule.

A **universal GAN/diffusion fingerprint detector** trained on outputs from 50+ generative models (StyleGAN2/3, FaceSwap, Stable Diffusion, Sora, Kling, Runway) would be able to flag content from any known generator, even for content that defeats the physiological and sync layers.

The `SpectralCNN` architecture already in MAVEN's codebase is the starting point for this — it would need to be trained on a comprehensive multi-generator dataset with supervised contrastive learning.

---

**Q68. How would you implement per-frame GradCAM explainability heatmaps?**

**A:** GradCAM (Gradient-weighted Class Activation Mapping) computes gradients of the classification output with respect to the last convolutional feature map, then weights the feature maps by their gradient magnitudes. The result is a spatial heatmap highlighting *which facial regions* contributed most to the fake classification.

For MAVEN's DFDC EfficientNet:
1. Register a forward hook on the last EfficientNet convolutional layer
2. During inference, capture the feature activations and output gradients
3. Compute `GradCAM = ReLU(Σ(α_k × A_k))` where `α_k = (1/Z) Σ_ij (∂y/∂A_k_ij)`
4. Upsample to original frame dimensions and overlay on the face crop

Output: a per-frame heatmap (e.g., JSON of pixel weights or a base64 PNG overlay URL), surfaced in the Result page's `HeatmapViewer` component. This gives journalists and forensic analysts the ability to see exactly which part of the face the model flagged — a critical trust-building feature.

---

**Q69. What CI/CD pipeline should be added before production launch?**

**A:** A minimal but credible pipeline via GitHub Actions:

```
On Pull Request:
├── Backend: ESLint + Jest unit tests on routes/controllers/services
├── FFT Service: pytest on analyzer.py + spectral_analyzer.py
├── Liveness Service: pytest on rppg.py + blink_detector.py
├── LipSync Service: pytest on cross_modal_transformer.py
└── Docker: Build test for all Dockerfiles

On Merge to main:
├── Frontend: Vite build (catches TypeScript/JSX errors)
├── Backend: npm ci + test
└── Deploy to staging (Vercel preview + Railway staging env)

On Release Tag:
└── Deploy to production + Playwright E2E smoke tests
```

The absence of any CI/CD is currently MAVEN's biggest credibility gap for a "production-ready" claim — a senior engineer would flag this immediately in code review.

---

**Q70. How would you calibrate the aggregator's threshold weights statistically rather than hand-tuning them?**

**A:** The current aggregator uses **hand-tuned weights and thresholds**, not statistically calibrated ones. The correct process:

1. **Collect a labeled validation set:** ~500–1000 videos labelled REAL/FAKE, balanced across generator types (FaceSwap, Wav2Lip, StyleGAN, diffusion-based) and video qualities (compressed, high-res, profile shots).

2. **Run all three services on every video** and collect the `(fft_score, liveness_score, lipsync_score)` feature triplet per video.

3. **Fit a calibration model:** Isotonic regression or Platt scaling on each service's output to produce calibrated probabilities.

4. **Optimise weights:** Logistic regression on the three calibrated scores against ground truth labels gives statistically optimal weights. Or use a small gradient boosted tree (XGBoost) to learn the aggregation function including interaction terms.

5. **Evaluate:** AUC-ROC on a held-out test set. Target: > 0.93 on FaceForensics++, > 0.90 on Celeb-DF v2.

6. **Re-evaluate on modern generators:** Regularly add new deepfake datasets to the validation set as new generators emerge.

---

## Quick Reference: Key Numbers

| Metric | Value |
|---|---|
| Total detection layers | 3 (FFT/Visual, rPPG/Blink, LipSync) |
| Models in FFT service | 2 active (dima806 ViT + selimsef DFDC B7 NS) + 4 signals |
| DFDC EfficientNet weights size | ~255 MB (auto-download) |
| SyncNet weights | Manual download required (`lipsync_expert.pth`) |
| rPPG skin regions | 3 (forehead + left cheek + right cheek) |
| LipSync window size | 5 frames (stride 1) |
| Minimum frames for rPPG | 100 frames (~4s at 25fps) |
| Max upload size | 100 MB (Multer limit) |
| Signed URL TTL | 1 hour |
| Socket.io push latency | ~10ms |
| Supabase Realtime latency | ~100–500ms (CDC) |
| Estimated analysis time (30s video, CPU) | 20–35 seconds |
| FAKE verdict threshold | finalFakeProb > 0.60 |
| REAL verdict threshold | finalFakeProb < 0.40 |
| UNCERTAIN band | 0.40 – 0.60 |
| Architecture score (explain.md) | 8/10 |
| Scalability score (explain.md) | 5/10 |
| Security score (explain.md) | 6/10 |
| Innovation score (explain.md) | 9/10 |

---

## Honest Disclosure Checklist
*What to proactively admit to any evaluator:*

- [ ] The `SpectralCNN` in `cnn_classifier.py` exists but is **not used in active inference** — bootstrap weights only
- [ ] `docker-compose.yml` is currently **empty** — full system cannot be started with `docker-compose up`
- [ ] `lipsync_expert.pth` (SyncNet weights) requires **manual download** — lipsync signal is absent without it
- [ ] DFDC weights **auto-download on first request** (~255MB) — first user experiences extended latency
- [ ] Aggregator weights are **hand-tuned**, not statistically calibrated on a labeled validation set
- [ ] No **rate limiting** on the submission endpoint — critical gap before public deployment
- [ ] Signed URL stored in DB, **expires after 1 hour** — correctness issue for old job re-analysis
- [ ] No **transaction** on dual DB write (jobs + results) — weak consistency guarantee
- [ ] The system has **not been evaluated on modern diffusion-generated video** (Sora, Kling, Veo)

---

*Generated from exhaustive analysis of `explain.md` v2.0 (June 2026) — reflects actual codebase implementation, not documentation claims.*
