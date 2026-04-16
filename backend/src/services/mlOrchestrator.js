const { computeFinalVerdict } = require('./aggregator');
const { saveAnalysisResult, markJobFailed } = require('./analysis.service');

// ML Service URLs — liveness defaults to null since service isn't implemented yet
const ML_SERVICES = {
    fft:      process.env.FFT_SERVICE_URL     || 'http://localhost:8001/analyze',
    lipsync:  process.env.LIPSYNC_SERVICE_URL || 'http://localhost:8003/analyze',
    // Liveness is optional — only called if a valid URL is configured
    liveness: process.env.LIVENESS_SERVICE_URL,
};

/**
 * Safely calls one ML service. Returns null on any error so a single
 * failing service doesn't abort the whole analysis job.
 */
async function safeCall(url, name, requestOptions) {
    if (!url || !url.startsWith('http')) {
        console.warn(`[ML] ${name} skipped — no valid URL configured.`);
        return null;
    }
    try {
        const res = await fetch(url, requestOptions);
        if (!res.ok) {
            console.warn(`[ML] ${name} returned HTTP ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn(`[ML] ${name} call failed: ${err.message}`);
        return null;
    }
}

/**
 * Runs the ML analysis by calling all available Python services in parallel.
 * Liveness is optional — a neutral placeholder is used if the service is
 * not configured or unavailable, so FFT + LipSync can still produce a verdict.
 *
 * @param {string} videoPath
 * @param {string} jobId
 */
async function runMLAnalysis(videoPath, jobId) {
    try {
        const controller  = new AbortController();
        const timeoutId   = setTimeout(() => controller.abort(), 120000); // 2 min

        const requestOptions = {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ video_path: videoPath }),
            signal:  controller.signal,
        };

        // Fan-out: run all available services in parallel
        const [fftResult, lipsyncResult, livenessResult] = await Promise.all([
            safeCall(ML_SERVICES.fft,      'FFT',      requestOptions),
            safeCall(ML_SERVICES.lipsync,  'LipSync',  requestOptions),
            safeCall(ML_SERVICES.liveness, 'Liveness', requestOptions),
        ]);

        clearTimeout(timeoutId);

        // FFT is the minimum required service
        if (!fftResult) {
            throw new Error('FFT service is required but failed or is not running.');
        }

        // Lipsync fallback — neutral score if service unavailable
        const resolvedLipsync = lipsyncResult ?? { sync_score: 0.5, verdict: 'UNKNOWN', _placeholder: true };

        // Liveness fallback — neutral 0.5 score (not yet implemented)
        const resolvedLiveness = livenessResult ?? { liveness_score: 0.5, _placeholder: true };

        // Aggregate scores → final verdict
        const finalResult = computeFinalVerdict({
            fftResult,
            livenessResult:  resolvedLiveness,
            lipsyncResult:   resolvedLipsync,
        });

        // Attach per-service raw data for the frontend Result page
        finalResult.fftResult      = fftResult;
        finalResult.lipsyncResult  = resolvedLipsync;
        finalResult.livenessResult = resolvedLiveness;

        await saveAnalysisResult(jobId, finalResult.verdict, finalResult);

    } catch (error) {
        console.error(`ML Analysis failed for job ${jobId}:`, error);
        await markJobFailed(jobId, error.message);
    }
}

module.exports = { runMLAnalysis };