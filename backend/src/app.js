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
const analysisRoutes = require('./routes/analysis.routes');

app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
