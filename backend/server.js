import 'dotenv/config';
import app from './src/app.js';
import { config } from './src/config/index.js';
import { logger } from './src/utils/logger.js';

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`🚀 MAVEN Backend running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.nodeEnv}`);
});
