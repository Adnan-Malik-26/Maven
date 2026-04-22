const multer = require('multer');
const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error(`${err.message}\n${err.stack}`);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 5MB' });
        }
        return res.status(400).json({ error: err.message });
    }

    // Custom errors with statusCode (e.g., throw { statusCode: 404, message: '...' })
    if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Default 500
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message || 'Internal Server Error';

    return res.status(500).json({ error: message });
}


module.exports = {
    errorHandler,
}
