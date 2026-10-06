import './types';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { prisma } from './lib/prisma';
import { pc } from './routes/pc';
import { admin } from './routes/admin';
import { errorHandler, globalLimiter, notFoundHandler } from './middleware/security';
import { uploadRoot } from './providers/storage';

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600,
  }));
  app.use(express.json({ limit: '1mb' }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  const v1 = express.Router();
  v1.get('/health', async (_req, res) => {
    let database = 'up';
    try { await prisma.$queryRaw`SELECT 1`; } catch { database = 'down'; }
    res.status(database === 'up' ? 200 : 503).json({ success: database === 'up', data: { api: 'up', database, time: new Date().toISOString() } });
  });
  v1.use('/uploads', express.static(uploadRoot, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  v1.use(globalLimiter);
  v1.use('/admin', admin);
  v1.use('/', pc);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
