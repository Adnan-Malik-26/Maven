require('dotenv/config');
const { config } = require('./src/config/index.js');
const { logger } = require('./src/utils/logger.js');
const { httpServer } = require('./src/app.js');

const PORT = config.port;

httpServer.listen(PORT, () => {
  logger.info(`🚀 MAVEN Backend running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.nodeEnv}`);
});
