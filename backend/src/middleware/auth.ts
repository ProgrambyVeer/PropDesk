import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AppError, forbidden, unauthorized } from '../lib/http';
import { hasPermission, type Permission } from '../lib/rbac';

const bearer = (req: Request) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

export async function issueSession(kind: 'PC' | 'ADMIN', subjectId: string, req: Request) {
  const ms = kind === 'PC' ? config.pcSessionDays * 86400e3 : config.adminSessionHours * 3600e3;
  const session = await prisma.session.create({
    data: {
      kind, userId: kind === 'PC' ? subjectId : null, adminId: kind === 'ADMIN' ? subjectId : null,
      ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300), expiresAt: new Date(Date.now() + ms),
    },
  });
  const secret = kind === 'PC' ? config.jwtSecret : config.adminJwtSecret;
  const token = jwt.sign({ sub: subjectId, sid: session.id }, secret, { audience: kind === 'PC' ? 'pc' : 'admin', expiresIn: Math.floor(ms / 1000) });
  return { token, expiresAt: session.expiresAt };
}

async function verify(req: Request, kind: 'PC' | 'ADMIN') {
  const token = bearer(req);
  if (!token) throw unauthorized();
  let payload: any;
  try {
    payload = jwt.verify(token, kind === 'PC' ? config.jwtSecret : config.adminJwtSecret, { audience: kind === 'PC' ? 'pc' : 'admin' });
  } catch {
    throw unauthorized('Session expired. Please log in again.');
  }
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true, admin: true } });
  if (!session || session.kind !== kind || session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session expired. Please log in again.');
  return session;
}

export async function pcAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await verify(req, 'PC');
  const user = session.user;
  if (!user) throw unauthorized();
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, `ACCOUNT_${user.status}`, user.status === 'SUSPENDED'
      ? 'Your account has been suspended. Please contact support.' : 'Your account has been deactivated.');
  }
  req.pc = user; req.sessionId = session.id;
  req.actor = { kind: 'pc', userId: user.id, name: user.name };
  next();
}

export async function adminAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await verify(req, 'ADMIN');
  const admin = session.admin;
  if (!admin || admin.status !== 'ACTIVE') throw forbidden('Administrator account disabled');
  req.admin = admin; req.sessionId = session.id;
  req.actor = { kind: 'admin', adminId: admin.id, role: admin.role, name: admin.name };
  next();
}

export const requirePerm = (...perms: Permission[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.actor?.kind !== 'admin') throw forbidden();
  const missing = perms.filter((p) => !hasPermission(req.actor.kind === 'admin' ? req.actor.role : 'READ_ONLY_ADMIN', p));
  if (missing.length) throw forbidden(`Your role does not allow this action (${missing.join(', ')})`);
  next();
};
