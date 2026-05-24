const Joi = require('joi');
const jobIdSchema = Joi.string().uuid().required();
const { getJobStatus, getJobWithResult, getUserJobHistory } = require('../services/analysis.service');


async function getJobResult(req, res, next) {
    const jobId = req.params.jobId ?? req.params.id;
    const userId = req.user?.id;

    // Validate jobId format before hitting the database.
    const { error: ValidationError } = jobIdSchema.validate(jobId);

    if (ValidationError) {
        const err = new Error(`Invalid jobId: ${ValidationError.details[0].message}`);
        err.statusCode = 400;
        return next(err);
    }

    try {

        const result = await getJobWithResult(jobId, userId);

        if (!result) return res.status(404).json({
            message: "job not found"
        })

        if (result.status === "PROCESSING") return res.status(202).json({
            message: "job is processing"
        })
        else if (result.status === "FAILED") {
            return res.status(400).json({
                message: "job has failed, check err message for more details.",
                error: result.error_message
            })
        }
        else {
            const analysisResult = Array.isArray(result.analysis_results)
                ? result.analysis_results[0]
                : result.analysis_results;

            // Merge job-level fields (video_path, original_name) into the result
            // so the frontend can render the video player and metadata strip
            return res.status(200).json({
                message: "job analysis completed",
                result: {
                    ...analysisResult,
                    video_path:    result.video_path    ?? null,
                    original_name: result.original_name ?? null,
                    file_size_mb:  result.file_size_mb  ?? null,
                    created_at:    result.created_at    ?? analysisResult?.created_at ?? null,
                }
            });
        }



    } catch (error) {
        next(error);
    }
}

async function getAnalysisJobStatus(req, res, next) {
    const jobId = req.params.jobId ?? req.params.id;
    const userId = req.user?.id;

    const { error: ValidationError } = jobIdSchema.validate(jobId);

    if (ValidationError) {
        const err = new Error(`Invalid jobId: ${ValidationError.details[0].message}`);
        err.statusCode = 400;
        return next(err);
    }

    try {
        const job = await getJobStatus(jobId, userId);

        if (!job) return res.status(404).json({
            message: "job not found"
        })

        return res.status(200).json({
            message: "job status found",
            job
        })
    } catch (error) {
        next(error);
    }
}

async function getJobHistory(req, res, next) {
    const userId = req.user.id;

    try {
        const history = await getUserJobHistory(userId);

        if (!history) return res.status(200).json({
            message: "no history found",
            data: []
        })

        return res.status(200).json({
            message: "history found",
            data: history
        })

    } catch (err) {
        next(err);
    }
}


module.exports = {
    getAnalysisJobStatus,
    getJobResult,
    getJobHistory
}
