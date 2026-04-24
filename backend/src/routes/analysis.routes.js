const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth.middleware');
const uploadVideo = require('../middleware/upload.middleware');
const { submitVideo } = require('../controllers/analysis.controller');
const { getJobHistory, getJobResult } = require('../controllers/results.controller');

router.post('/submit', requireAuth, uploadVideo.single('video'), submitVideo);
router.get('/jobs', requireAuth, getJobHistory);
router.get('/jobs/:id', requireAuth, getJobResult);

module.exports = router;