
const { getJobWithResult, getUserJobHistory } = require('../services/analysis.service');


async function getJobResult(req, res, next) {
    const { jobId } = req.params;
    const userId = req.user.id;

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
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message
        });
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
        return res.status(500).json({
            message: "Internal Server Error",
            error: err.message
        });
    }
}


module.exports = {
    getJobResult,
    getJobHistory
}
