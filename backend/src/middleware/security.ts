import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http';
import { logger } from '../lib/logger';
import { config } from '../config';

const limiter = (windowMs: number, limit: number, key?: (r: Request) => string) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, validate: false,
  skip: () => config.isTest,
  keyGenerator: key ?? ((r) => r.ip || 'unknown'),
  handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } }),
});

export const globalLimiter = limiter(60_000, 600);
export const otpLimiter = limiter(10 * 60_000, 10, (r) => `${r.ip}:${String(r.body?.phone || '')}`);
export const adminLoginLimiter = limiter(15 * 60_000, 20, (r) => `${r.ip}:${String(r.body?.email || '').toLowerCase()}`);

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.maxUploadMb} MB)` : err.message } });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
  logger.error(err?.stack || err);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}
