const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger.js');

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}  `);
  next();
});
// Import routes
const authRoutes = require('./routes/auth.routes');

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
