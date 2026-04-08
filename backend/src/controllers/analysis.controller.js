const { uploadVideoToStorage, createAnalysisJob } = require('../services/analysis.service');

async function submitVideo(req, res, next) {


    if (!req.file) {
        return res.status(400).json({
            message: "No file uploaded"
        })
    }

    try {
        const userId = req.user.id;
        const fileBuffer = req.file.buffer;
        
        // BUG FIX: Multer sets the property to 'originalname' (lowercase n)
        const originalName = req.file.originalname;

        // OPTIMIZATION: Appending a timestamp prevents users from overwriting files with the same name
        const uniqueFileName = `${Date.now()}-${originalName}`;
        const videoPath = await uploadVideoToStorage(fileBuffer, uniqueFileName, userId);
        
        if (!videoPath) {
            return res.status(400).json({
                message: "Failed to upload video"
            });
        }

        // Add the Database Save sequence!
        const analysisJob = await createAnalysisJob(userId, videoPath);

        // OPTIMIZATION & BUG FIX: You forgot to return a success response! 
        // The API would have hung forever since `res.send()` was never called.
        return res.status(200).json({
            message: "Video uploaded and Analysis Job created successfully",
            data: { 
                job: analysisJob 
            }
        });

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