const { computeFinalVerdict } = require('./aggregator');
const { saveAnalysisResult, markJobFailed } = require('./analysis.service');
const { getIO } = require('../socket.js');
const { logger } = require('../utils/logger');

// ML Service URLs (placeholders/config for now)
const ML_SERVICES = {
    fft: process.env.FFT_SERVICE_URL || 'http://localhost:8001/analyze',
    liveness: process.env.LIVENESS_SERVICE_URL || 'http://localhost:8002/analyze',
    lipsync: process.env.LIPSYNC_SERVICE_URL || 'http://localhost:8003/analyze'
};

/**
 * Runs the ML analysis by calling all 3 Python services in parallel.
 * 
 * @param {string} videoPath 
 * @param {string} jobId 
 */
async function runMLAnalysis(videoPath, jobId) {
    const roomName = 'job:' + jobId;
    try {
        // Create an AbortController for the 2-minute timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: videoPath }),
            signal: controller.signal
        };

        // Call the 3 services in parallel using built-in fetch
        const [fftResponse, livenessResponse, lipsyncResponse] = await Promise.all([
            fetch(ML_SERVICES.fft, requestOptions),
            fetch(ML_SERVICES.liveness, requestOptions),
            fetch(ML_SERVICES.lipsync, requestOptions)
        ]);

        // Clear the timeout since requests finished
        clearTimeout(timeoutId);

        // Check if any HTTP requests failed
        if (!fftResponse.ok) throw new Error(`FFT service failed with status ${fftResponse.status}`);
        if (!livenessResponse.ok) throw new Error(`Liveness service failed with status ${livenessResponse.status}`);
        if (!lipsyncResponse.ok) throw new Error(`LipSync service failed with status ${lipsyncResponse.status}`);

        // Parse JSON responses
        const fftResult = await fftResponse.json();
        const livenessResult = await livenessResponse.json();
        const lipsyncResult = await lipsyncResponse.json();

        // Calculate the final verdict
        const finalResult = computeFinalVerdict({
            fftResult,
            livenessResult,
            lipsyncResult
        });

        // Save the result to Supabase
        await saveAnalysisResult(jobId, finalResult.verdict, finalResult);

        getIO().to(roomName).emit("analysis_complete", {
            jobId,
            verdict: finalResult.verdict,
            confidence: finalResult.confidence,
            breakdown: finalResult.breakdown
        })

    } catch (error) {
        logger.error(`ML Analysis failed for job ${jobId}: ${error.message}`);
        // Mark job as failed in the DB so it doesn't get stuck in PROCESSING
        await markJobFailed(jobId, error.message);
        getIO().to(roomName).emit("analysis_failed", {
            jobId,
            message: "The analysis failed!",
        })
    }
}

module.exports = {
    runMLAnalysis
};