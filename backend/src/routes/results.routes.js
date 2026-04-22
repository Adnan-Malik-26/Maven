const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { getResult } = require('../controllers/results.controller');

router.get('/:jobId', requireAuth, getResult);

module.exports = router;
