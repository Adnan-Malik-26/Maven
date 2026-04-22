const { uploadVideoToStorage, createAnalysisJob } = require('../services/analysis.service');
const { runMLAnalysis } = require('../services/mlOrchestrator');

async function submitVideo(req, res, next) {

    // check if file is exist in req object
    if (!req.file) {
        return res.status(400).json({
            message: "No file uploaded"
        })
    }

    try {
        // extract user id from req object
        const userId = req.user?.id;

        // extract file buffer from req object , buffer is raw data of file.
        const fileBuffer = req.file?.buffer;

        // Multer sets the property to 'originalname' (lowercase n)
        const originalName = req.file?.originalname;

        // Appending a timestamp prevents users from overwriting files with the same name
        const uniqueFileName = `${Date.now()}-${originalName}`;
        const videoPath = await uploadVideoToStorage(fileBuffer, uniqueFileName, userId);

        if (!videoPath) {
            return res.status(400).json({
                message: "Failed to upload video"
            });
        }

        // Add the Database Save sequence!
        const analysisJob = await createAnalysisJob(userId, videoPath);


        res.status(202).json({
            message: "Analysis started",
            jobId: analysisJob.id,
        });

        // Run ML analysis in the background without awaiting it
        // Use analysisJob.video_path which is the full public URL (not the raw storage path)
        runMLAnalysis(analysisJob.video_path, analysisJob.id).catch((err) => {
            console.error("Background task error:", err);
        });

        return;

    } catch (err) {
        return res.status(500).json({
            message: "Internal Server Error",
            error: err.message
        });
    }

};






module.exports = {
    submitVideo,
}