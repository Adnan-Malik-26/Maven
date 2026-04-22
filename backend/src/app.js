const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger.js');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { setIO } = require('./socket.js');


const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // * means all origins are allowed.
  }
});

// Register io in the singleton so services can access it without circular imports
setIO(io);

io.on("connection", (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on("join_job", (jobId) => {
    if (!jobId) return;

    const roomName = `job:${jobId}`;
    socket.join(roomName);

    socket.emit("joined", roomName);
  });

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});


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
const resultRoutes = require('./routes/results.routes');

app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/results', resultRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 catch-all (no route matched)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (MUST be last middleware)
const { errorHandler } = require('./middleware/error.middleware.js');
app.use(errorHandler);

module.exports = {
  httpServer
}
