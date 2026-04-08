require('dotenv/config');
const app = require('./src/app.js');
const { config } = require('./src/config/index.js');
const { logger } = require('./src/utils/logger.js');

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`🚀 MAVEN Backend running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.nodeEnv}`);
});
