const Joi = require('joi');
const jobIdSchema = Joi.string().uuid().required();
const { getJobWithResult, getUserJobHistory } = require('../services/analysis.service');


async function getJobResult(req, res, next) {
    const { jobId } = req.params;
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
            return res.status(200).json({
                message: "job analysis completed",
                result: result.analysis_results
            });



        }



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
    getJobResult,
    getJobHistory
}
