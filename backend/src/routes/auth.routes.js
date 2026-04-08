const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Public endpoints
router.post('/signup', authController.handleSignUp);
router.post('/login', authController.handleLogin);
router.post('/reset-password', authController.handlePasswordResetRequest);

// Protected endpoints
// Update password requires either an active session or the access_token in headers
router.post('/update-password', requireAuth, authController.handleUpdatePassword);
router.post('/logout', requireAuth, authController.handleLogout);

module.exports = router;
