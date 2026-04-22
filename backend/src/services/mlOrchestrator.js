const { computeFinalVerdict } = require('./aggregator');
const { saveAnalysisResult, markJobFailed } = require('./analysis.service');

const ML_SERVICES = {
    fft:      process.env.FFT_SERVICE_URL      || 'http://localhost:8001/analyze',
    lipsync:  process.env.LIPSYNC_SERVICE_URL  || 'http://localhost:8003/analyze',
    liveness: process.env.LIVENESS_SERVICE_URL || 'http://localhost:8002/analyze',
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
 *
 * IMPORTANT — payload shapes differ per service:
 *   FFT service       → { video_path }          (reads from local path or URL)
 *   Liveness service  → { video_url, job_id }   (downloads from signed URL)
 *   LipSync service   → { video_url, job_id }   (downloads from signed URL)
 *
 * @param {string} videoPath  — signed Supabase Storage URL
 * @param {string} jobId
 */
async function runMLAnalysis(videoPath, jobId) {
    try {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 120000); // 2 min

        const commonOpts = {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  controller.signal,
        };

        // FFT expects { video_path }
        const fftOptions = {
            ...commonOpts,
            body: JSON.stringify({ video_path: videoPath }),
        };

        // Liveness + LipSync expect { video_url, job_id }
        const videoUrlOptions = {
            ...commonOpts,
            body: JSON.stringify({ video_url: videoPath, job_id: jobId }),
        };

        // Fan-out: all services run in parallel
        const [fftResult, lipsyncResult, livenessResult] = await Promise.all([
            safeCall(ML_SERVICES.fft,      'FFT',      fftOptions),
            safeCall(ML_SERVICES.lipsync,  'LipSync',  videoUrlOptions),
            safeCall(ML_SERVICES.liveness, 'Liveness', videoUrlOptions),
        ]);

        clearTimeout(timeoutId);

        // FFT is the minimum required service
        if (!fftResult) {
            throw new Error('FFT service is required but failed or is not running.');
        }

        // Neutral fallbacks when optional services are unavailable
        const resolvedLipsync  = lipsyncResult  ?? { sync_score: 0.5, verdict: 'UNKNOWN', _placeholder: true };
        const resolvedLiveness = livenessResult ?? { liveness_score: 0.5, _placeholder: true };

        // Aggregate scores → final verdict
        const finalResult = computeFinalVerdict({
            fftResult,
            livenessResult:  resolvedLiveness,
            lipsyncResult:   resolvedLipsync,
        });

        // Attach raw service outputs for the frontend Result page
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