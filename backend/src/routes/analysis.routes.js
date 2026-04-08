const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth.middleware');
const uploadVideo = require('../middleware/upload.middleware');
const { submitVideo } = require('../controllers/analysis.controller');

// BUG FIX: You must pipe the request through the `uploadVideo.single('video')` 
// middleware so Multer can actually parse the file inside FormData!
router.post('/submit', requireAuth, uploadVideo.single('video'), submitVideo);

// BUG FIX: You forgot to export the router, which crashed the server!
module.exports = router;