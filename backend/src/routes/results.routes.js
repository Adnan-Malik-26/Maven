const { Router } = require("express");
const { requireAuth } = require('../middleware/auth.middleware');
const { getJobResult, getJobHistory } = require('../controllers/results.controller');

const router = Router();


router.get('/history', requireAuth, getJobHistory);
router.get('/:jobId', requireAuth, getJobResult);


module.exports = router