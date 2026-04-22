const express = require('express');
const router  = express.Router();

const { requireAuth }                     = require('../middleware/auth.middleware');
const uploadVideo                         = require('../middleware/upload.middleware');
const { submitVideo }                     = require('../controllers/analysis.controller');
const { getJobs, getJob, deleteJob }      = require('../controllers/results.controller');

router.post('/submit', requireAuth, uploadVideo.single('video'), submitVideo);
router.get('/jobs',     requireAuth, getJobs);
router.get('/jobs/:id', requireAuth, getJob);
router.delete('/jobs/:id', requireAuth, deleteJob);

module.exports = router;