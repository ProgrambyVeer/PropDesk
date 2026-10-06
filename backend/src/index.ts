import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startScheduler } from './services/notifications';

const app = createApp();
const server = app.listen(config.port, '0.0.0.0', () => logger.info(`PropCRM API listening on :${config.port} (${config.env})`));
const timer = startScheduler();

const shutdown = async () => {
  clearInterval(timer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
