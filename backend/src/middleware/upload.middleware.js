const multer = require('multer');
const { config } = require('../config/index');

const storage = multer.memoryStorage();
const uploadVideo = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5, // 5 MB (Fixed typo: fileSize must have a capital S)
    },
    fileFilter: function (req, file, cb) {
        // Fixed: Array syntax needed quotes across multiple items
        const allowedFile = ['video/mp4', 'video/webm'];
        if (allowedFile.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});



module.exports = uploadVideo;