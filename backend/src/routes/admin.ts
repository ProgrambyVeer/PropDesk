import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, ci, fieldError, forbidden, isIndianMobile, normalizePhone, notFound, ok, pageMeta, paging, parse, str } from '../lib/http';
import { nextCode } from '../lib/codes';
import { loadOwned } from '../lib/scope';
import { audit, logActivity } from '../lib/activity';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { ROLE_PERMISSIONS } from '../lib/rbac';
import { adminAuth, issueSession, requirePerm } from '../middleware/auth';
import { adminLoginLimiter } from '../middleware/security';
import * as R from '../services/records';
import { changeStage, PROBABILITY, updateDeal } from '../services/deals';
import { moveToBin, purgeFromBin, restoreFromBin } from '../services/bin';
import { computeAnalytics } from '../services/analytics';
import { globalSearch } from '../services/search';
import { matchesForRequirement, txPrice } from '../services/matching';
import { optStr } from '../services/validation';

export const admin = Router();
const adminView = (a: any) => ({ id: a.id, email: a.email, name: a.name, role: a.role, status: a.status, twoFactorEnabled: a.twoFactorEnabled, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt, permissions: ROLE_PERMISSIONS[a.role as keyof typeof ROLE_PERMISSIONS] });
const pcSel = { select: { id: true, name: true, pcCode: true, phone: true } };
const confirmText = (req: Request, text = 'DELETE PERMANENTLY') => { if (req.body?.confirmText !== text) throw fieldError({ confirmText: `Type ${text} to confirm` }); };
const pcFilter = (req: Request) => (str(req.query.pcId) ? { ownerId: String(req.query.pcId) } : {});
const dateRange = (req: Request) => {
  const range = String(req.query.range || '');
  const days: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '3m': 90, '6m': 182, '1y': 365 };
  if (range === 'custom') return { from: req.query.from ? new Date(String(req.query.from)) : undefined, to: req.query.to ? new Date(`${req.query.to}T23:59:59`) : undefined };
  if (range in days) { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: new Date(d.getTime() - days[range] * 86400e3), to: undefined }; }
  return { from: undefined, to: undefined };
};

/* ================= AUTH (email + password) ================= */
admin.post('/auth/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email('Enter a valid email').transform((e) => e.toLowerCase()), password: z.string().min(1, 'Password is required') }), req.body);
  const meta = { email, ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) };
  const a = await prisma.adminUser.findUnique({ where: { email } });
  const fail = async (reason: string, msg = 'Invalid email or password', status = 401) => {
    await prisma.adminLoginAttempt.create({ data: { ...meta, success: false, reason } });
    throw new AppError(status, 'LOGIN_FAILED', msg);
  };
  if (!a) return fail('unknown_email');
  if (a.status !== 'ACTIVE') return fail('disabled', 'This administrator account is disabled', 403);
  if (a.lockedUntil && a.lockedUntil > new Date()) return fail('locked', 'Too many failed attempts. Try again in 15 minutes.', 429);
  if (!(await bcrypt.compare(password, a.passwordHash))) {
    const attempts = a.failedAttempts + 1;
    await prisma.adminUser.update({ where: { id: a.id }, data: { failedAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60e3) : null } });
    return fail('bad_password');
  }
  // 2FA-ready: when twoFactorEnabled, a TOTP step would be required here before issuing the session.
  const updated = await prisma.adminUser.update({ where: { id: a.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await prisma.adminLoginAttempt.create({ data: { ...meta, success: true } });
  const { token, expiresAt } = await issueSession('ADMIN', a.id, req);
  await audit(req, { action: 'ADMIN_LOGIN', entityType: 'ADMIN', entityId: a.id, adminId: a.id });
  ok(res, { token, expiresAt, admin: adminView(updated) });
});

admin.use(adminAuth);
admin.post('/auth/logout', async (req, res) => {
  await prisma.session.update({ where: { id: req.sessionId! }, data: { revokedAt: new Date() } });
  await audit(req, { action: 'ADMIN_LOGOUT', entityType: 'ADMIN', entityId: req.admin!.id });
  ok(res, { loggedOut: true });
});
admin.get('/auth/me', (req, res) => ok(res, adminView(req.admin)));
admin.post('/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(10, 'Use at least 10 characters') }), req.body);
  if (!(await bcrypt.compare(currentPassword, req.admin!.passwordHash))) throw fieldError({ currentPassword: 'Current password is incorrect' });
  await prisma.adminUser.update({ where: { id: req.admin!.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  await audit(req, { action: 'ADMIN_PASSWORD_CHANGED', entityType: 'ADMIN', entityId: req.admin!.id });
  ok(res, { changed: true });
});

/* ================= DASHBOARD ================= */
admin.get('/dashboard', requirePerm('dashboard:read'), async (_req, res) => {
  const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
  const nd = { deletedAt: null };
  const [pcs, active, suspended, clients, props, activeProps, reqs, activeReqs, activeDeals, closedDeals, agg, open, newPcs, newClients, newProps, newReqs, closedMonth] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { status: 'ACTIVE' } }), prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.client.count({ where: nd }), prisma.property.count({ where: nd }), prisma.property.count({ where: { ...nd, status: 'ACTIVE' } }),
    prisma.requirement.count({ where: nd }), prisma.requirement.count({ where: { ...nd, status: 'ACTIVE' } }),
    prisma.deal.count({ where: { ...nd, stage: { notIn: ['CLOSED', 'LOST'] } } }), prisma.deal.count({ where: { ...nd, stage: 'CLOSED' } }),
    prisma.deal.aggregate({ where: { ...nd, stage: { not: 'LOST' } }, _sum: { dealValue: true } }),
    prisma.deal.aggregate({ where: { ...nd, stage: { notIn: ['CLOSED', 'LOST'] } }, _sum: { expectedCommission: true } }),
    prisma.user.count({ where: { createdAt: { gte: som } } }), prisma.client.count({ where: { ...nd, createdAt: { gte: som } } }),
    prisma.property.count({ where: { ...nd, createdAt: { gte: som } } }), prisma.requirement.count({ where: { ...nd, createdAt: { gte: som } } }),
    prisma.deal.aggregate({ where: { ...nd, stage: 'CLOSED', closingDate: { gte: som } }, _count: true, _sum: { finalCommission: true } }),
  ]);
  const earned = await prisma.deal.aggregate({ where: { ...nd, stage: 'CLOSED' }, _sum: { finalCommission: true } });
  ok(res, {
    totals: { totalPcs: pcs, activePcs: active, suspendedPcs: suspended, totalClients: clients, totalProperties: props, activeProperties: activeProps, totalRequirements: reqs, activeRequirements: activeReqs, activeDeals, closedDeals, totalDealValue: agg._sum.dealValue || 0, totalExpectedCommission: open._sum.expectedCommission || 0, totalEarnedCommission: earned._sum.finalCommission || 0 },
    thisMonth: { newPcs, newClients, newProperties: newProps, newRequirements: newReqs, dealsClosed: closedMonth._count, commission: closedMonth._sum.finalCommission || 0 },
    recentAudit: await prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { admin: { select: { name: true } } } }),
  });
});
admin.get('/analytics', requirePerm('analytics:read'), async (req, res) => {
  const { from, to } = dateRange(req);
  ok(res, await computeAnalytics({ ownerId: str(req.query.pcId), from, to, location: str(req.query.location), category: str(req.query.category), kind: str(req.query.kind) }));
});
admin.get('/search', requirePerm('records:read'), async (req, res) => ok(res, await globalSearch(String(req.query.q || ''), undefined, 10)));

/* ================= PCs ================= */
const pcCreate = z.object({
  phone: z.string().transform(normalizePhone).refine(isIndianMobile, 'Enter a valid 10-digit mobile number'), name: z.string().trim().min(2, 'Name is required'),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email().nullable().optional()), companyName: optStr, reraNumber: optStr, officeAddress: optStr,
  areasOfOperation: z.array(z.string()).optional(),
});
admin.get('/pcs', requirePerm('pcs:read'), async (req, res) => {
  const p = paging(req.query, ['createdAt', 'name', 'lastLoginAt']);
  const where: any = {};
  const q = str(req.query.q);
  if (q) where.OR = [{ name: ci(q) }, { phone: { contains: q } }, { email: ci(q) }, { pcCode: ci(q) }, { profile: { companyName: ci(q) } }];
  if (str(req.query.status)) where.status = req.query.status;
  if (str(req.query.location)) where.profile = { areasOfOperation: { has: String(req.query.location) } };
  if (req.query.from || req.query.to) where.createdAt = { gte: req.query.from ? new Date(String(req.query.from)) : undefined, lte: req.query.to ? new Date(`${req.query.to}T23:59:59`) : undefined };
  const nd = { where: { deletedAt: null } };
  const [total, items] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, ...p, include: { profile: true, _count: { select: { properties: nd, clients: nd, requirements: nd, deals: nd } } } })]);
  ok(res, items, pageMeta(total, p));
});
admin.post('/pcs', requirePerm('pcs:write'), async (req, res) => {
  const { companyName, reraNumber, officeAddress, areasOfOperation, ...u } = parse(pcCreate, req.body);
  const user = await prisma.user.create({ data: { ...u, email: u.email ?? null, pcCode: await nextCode('PC'), profile: { create: { companyName, reraNumber, officeAddress, areasOfOperation: areasOfOperation || [], whatsappNumber: u.phone } } }, include: { profile: true } });
  await audit(req, { action: 'PC_CREATED', entityType: 'PC', entityId: user.id, entityCode: user.pcCode, affectedPcId: user.id, after: user });
  ok(res, user, undefined, 201);
});
admin.get('/pcs/:id', requirePerm('pcs:read'), async (req, res) => {
  const u = await prisma.user.findFirst({ where: { OR: [{ id: req.params.id }, { pcCode: req.params.id }] }, include: { profile: true, statusChanges: { orderBy: { createdAt: 'desc' }, include: { admin: { select: { name: true } } } } } });
  if (!u) throw notFound('PC');
  const a = await computeAnalytics({ ownerId: u.id });
  ok(res, { ...u, stats: { properties: a.totals.totalProperties, clients: a.totals.totalClients, requirements: a.totals.totalRequirements, activeDeals: a.totals.activeDeals, closedDeals: a.totals.closedDeals, dealValue: a.totals.dealValue, commission: a.totals.earnedCommission, expectedCommission: a.totals.expectedCommission, followUps: a.followUpCompletion.reduce((s, x) => s + x.value, 0) } });
});
admin.patch('/pcs/:id', requirePerm('pcs:write'), async (req, res) => {
  const before = await prisma.user.findUnique({ where: { id: req.params.id }, include: { profile: true } });
  if (!before) throw notFound('PC');
  const { companyName, reraNumber, officeAddress, areasOfOperation, ...u } = parse(pcCreate.partial(), req.body);
  const profile = Object.fromEntries(Object.entries({ companyName, reraNumber, officeAddress, areasOfOperation }).filter(([, v]) => v !== undefined));
  const after = await prisma.user.update({ where: { id: before.id }, data: { ...u, profile: { upsert: { create: profile, update: profile } } }, include: { profile: true } });
  await audit(req, { action: 'PC_EDITED', entityType: 'PC', entityId: before.id, entityCode: before.pcCode, affectedPcId: before.id, before, after });
  ok(res, after);
});
admin.post('/pcs/:id/status', requirePerm('pcs:status'), async (req, res) => {
  const { status, reason, confirm } = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']), reason: optStr, confirm: z.boolean().optional() }), req.body);
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) throw notFound('PC');
  if (u.status === status) throw badRequest(`PC is already ${status}`);
  if (status !== 'ACTIVE' && !confirm) throw badRequest('Confirmation required for this action');
  if (status !== 'ACTIVE' && !reason) throw fieldError({ reason: 'Reason is required' });
  const updated = await prisma.user.update({ where: { id: u.id }, data: { status: status as UserStatus } });
  await prisma.pCStatusChange.create({ data: { userId: u.id, adminId: req.admin!.id, fromStatus: u.status, toStatus: status as UserStatus, reason: reason ?? null } });
  if (status !== 'ACTIVE') await prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, { action: status === 'ACTIVE' ? 'PC_ACTIVATED' : status === 'SUSPENDED' ? 'PC_SUSPENDED' : 'PC_DEACTIVATED', entityType: 'PC', entityId: u.id, entityCode: u.pcCode, affectedPcId: u.id, before: { status: u.status }, after: { status, reason } });
  ok(res, updated);
});
admin.get('/pcs/:id/activity', requirePerm('audit:read'), async (req, res) => {
  const p = paging(req.query, ['createdAt']);
  const where = { userId: req.params.id };
  const [total, items] = await Promise.all([prisma.activityLog.count({ where }), prisma.activityLog.findMany({ where, ...p })]);
  ok(res, items, pageMeta(total, p));
});
admin.get('/pcs/:id/analytics', requirePerm('analytics:read'), async (req, res) => {
  const a = await computeAnalytics({ ownerId: req.params.id });
  const shares = await prisma.propertyShare.count({ where: { senderId: req.params.id } });
  ok(res, { ...a, totals: { ...a.totals, propertyShares: shares } });
});

/* ================= RECORDS ================= */
const listOf = (model: string, sortable: string[], build: (req: Request) => any, include: any, map?: (x: any) => any) => async (req: Request, res: any) => {
  const p = paging(req.query, sortable);
  const where = { ...pcFilter(req), ...build(req) };
  if (req.query.deleted !== 'true' && model !== 'notification') where.deletedAt = null;
  const d = (prisma as any)[model];
  const [total, items] = await Promise.all([d.count({ where }), d.findMany({ where, ...p, include })]);
  ok(res, map ? items.map(map) : items, pageMeta(total, p));
};
const q = (req: Request) => str(req.query.q);

admin.get('/clients', requirePerm('records:read'), listOf('client', ['createdAt', 'name'], (req) => ({
  ...(q(req) ? { OR: [{ name: ci(q(req)!) }, { phone: { contains: q(req) } }, { code: ci(q(req)!) }, { location: ci(q(req)!) }] } : {}),
  ...(str(req.query.status) ? { status: req.query.status } : {}),
}), { owner: pcSel, _count: { select: { requirements: { where: { deletedAt: null } }, links: { where: { status: 'ACTIVE' } }, deals: { where: { deletedAt: null } } } } }));
admin.get('/clients/:id', requirePerm('records:read'), async (req, res) => {
  const c = await loadOwned<any>('client', req.params.id, req.actor, { includeDeleted: true, include: { owner: pcSel, requirements: { where: { deletedAt: null } }, links: { include: { property: { select: { id: true, code: true, location: true } }, requirement: { select: { code: true } } } }, deals: { where: { deletedAt: null }, include: { property: { select: { code: true } }, requirement: { select: { code: true } } } }, followUps: { where: { deletedAt: null }, include: { requirement: { select: { code: true } } } } } });
  ok(res, { ...c, timeline: await prisma.activityLog.findMany({ where: { clientId: c.id }, orderBy: { createdAt: 'desc' }, take: 50 }) });
});
admin.patch('/clients/:id', requirePerm('records:write'), async (req, res) => {
  const before = await loadOwned<any>('client', req.params.id, req.actor);
  const after = await R.updateClient(req.actor, before.id, req.body);
  await audit(req, { action: 'CLIENT_MODIFIED', entityType: 'CLIENT', entityId: before.id, entityCode: before.code, affectedPcId: before.ownerId, before, after });
  ok(res, after);
});
admin.delete('/clients/:id', requirePerm('records:write'), async (req, res) => {
  const c = await loadOwned<any>('client', req.params.id, req.actor);
  const item = await moveToBin(req.actor, 'CLIENT', c, str(req.body?.reason));
  await audit(req, { action: 'CLIENT_DELETED', entityType: 'CLIENT', entityId: c.id, entityCode: c.code, affectedPcId: c.ownerId });
  ok(res, item);
});

const propPrice = (p: any) => p.transactions?.map((t: any) => ({ kind: t.kind, price: txPrice(t) }));
admin.get('/properties', requirePerm('records:read'), listOf('property', ['createdAt', 'updatedAt'], (req) => ({
  ...(q(req) ? { OR: [{ code: ci(q(req)!) }, { location: ci(q(req)!) }, { subtype: ci(q(req)!) }, { owner: { name: ci(q(req)!) } }] } : {}),
  ...(str(req.query.category) ? { category: req.query.category } : {}), ...(str(req.query.status) ? { status: req.query.status } : {}),
  ...(str(req.query.kind) ? { transactions: { some: { kind: req.query.kind } } } : {}), ...(str(req.query.location) ? { location: ci(String(req.query.location)) } : {}),
}), { owner: pcSel, transactions: true, photos: { take: 1, orderBy: { position: 'asc' } }, _count: { select: { links: { where: { status: 'ACTIVE' } }, shares: true } } }, (p) => ({ ...p, prices: propPrice(p) })));
admin.get('/properties/:id', requirePerm('records:read'), async (req, res) => {
  const p = await loadOwned<any>('property', req.params.id, req.actor, { includeDeleted: true, include: R.propertyDetailInclude });
  ok(res, { ...p, timeline: await prisma.activityLog.findMany({ where: { propertyId: p.id }, orderBy: { createdAt: 'desc' }, take: 50 }) });
});
admin.patch('/properties/:id', requirePerm('records:write'), async (req, res) => {
  const before = await loadOwned<any>('property', req.params.id, req.actor, { include: { transactions: true } });
  const after = await R.updateProperty(req.actor, before.id, req.body);
  await audit(req, { action: 'PROPERTY_MODIFIED', entityType: 'PROPERTY', entityId: before.id, entityCode: before.code, affectedPcId: before.ownerId, before, after });
  ok(res, after);
});
admin.post('/properties/:id/deactivate', requirePerm('records:write'), async (req, res) => {
  const p = await loadOwned<any>('property', req.params.id, req.actor);
  const status = p.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
  const after = await prisma.property.update({ where: { id: p.id }, data: { status } });
  await logActivity(req.actor, { entityType: 'PROPERTY', entityId: p.id, entityCode: p.code, ownerId: p.ownerId, propertyId: p.id, action: 'PROPERTY_EDITED', description: `Property ${p.code} ${status === 'ACTIVE' ? 'activated' : 'deactivated'} by admin` });
  await audit(req, { action: 'PROPERTY_MODIFIED', entityType: 'PROPERTY', entityId: p.id, entityCode: p.code, affectedPcId: p.ownerId, before: { status: p.status }, after: { status } });
  ok(res, after);
});
admin.delete('/properties/:id', requirePerm('records:write'), async (req, res) => {
  const p = await loadOwned<any>('property', req.params.id, req.actor);
  const item = await moveToBin(req.actor, 'PROPERTY', p, str(req.body?.reason));
  await audit(req, { action: 'PROPERTY_DELETED', entityType: 'PROPERTY', entityId: p.id, entityCode: p.code, affectedPcId: p.ownerId });
  ok(res, item);
});
admin.get('/properties/:id/shares', requirePerm('records:read'), async (req, res) => ok(res, await prisma.propertyShare.findMany({ where: { propertyId: req.params.id }, include: { sender: pcSel, receiver: pcSel, client: { select: { name: true } } }, orderBy: { createdAt: 'desc' } })));

admin.get('/requirements', requirePerm('records:read'), listOf('requirement', ['createdAt', 'code'], (req) => ({
  ...(q(req) ? { OR: [{ code: ci(q(req)!) }, { location: ci(q(req)!) }, { client: { name: ci(q(req)!) } }] } : {}),
  ...(str(req.query.type) ? { type: req.query.type } : {}), ...(str(req.query.category) ? { category: req.query.category } : {}), ...(str(req.query.status) ? { status: req.query.status } : {}),
  ...(str(req.query.clientId) ? { clientId: req.query.clientId } : {}),
}), { owner: pcSel, client: { select: { id: true, name: true, phone: true } } }));
admin.get('/requirements/:id', requirePerm('records:read'), async (req, res) => {
  const r = await loadOwned<any>('requirement', req.params.id, req.actor, { includeDeleted: true, include: { owner: pcSel, client: true, links: { include: { property: { select: { id: true, code: true, location: true } } } }, deals: true, followUps: true } });
  ok(res, { ...r, matches: (await matchesForRequirement(r)).slice(0, 10), timeline: await prisma.activityLog.findMany({ where: { requirementId: r.id }, orderBy: { createdAt: 'desc' } }) });
});
admin.patch('/requirements/:id', requirePerm('records:write'), async (req, res) => {
  const before = await loadOwned<any>('requirement', req.params.id, req.actor);
  const after = await R.updateRequirement(req.actor, before.id, req.body);
  await audit(req, { action: 'REQUIREMENT_MODIFIED', entityType: 'REQUIREMENT', entityId: before.id, entityCode: before.code, requirementCode: before.code, affectedPcId: before.ownerId, before, after });
  ok(res, after);
});
admin.delete('/requirements/:id', requirePerm('records:write'), async (req, res) => {
  const r = await loadOwned<any>('requirement', req.params.id, req.actor);
  const item = await moveToBin(req.actor, 'REQUIREMENT', r, str(req.body?.reason));
  await audit(req, { action: 'REQUIREMENT_DELETED', entityType: 'REQUIREMENT', entityId: r.id, entityCode: r.code, requirementCode: r.code, affectedPcId: r.ownerId });
  ok(res, item);
});

const dealInc = { owner: pcSel, client: { select: { id: true, name: true } }, property: { select: { id: true, code: true, location: true, category: true } }, requirement: { select: { id: true, code: true } } };
admin.get('/deals', requirePerm('records:read'), listOf('deal', ['createdAt', 'dealValue', 'closingDate'], (req) => ({
  ...(q(req) ? { OR: [{ code: ci(q(req)!) }, { client: { name: ci(q(req)!) } }, { requirement: { code: ci(q(req)!) } }, { property: { code: ci(q(req)!) } }] } : {}),
  ...(str(req.query.stage) ? { stage: req.query.stage } : {}),
  ...(str(req.query.category) || str(req.query.location) ? { property: { ...(str(req.query.category) ? { category: req.query.category } : {}), ...(str(req.query.location) ? { location: ci(String(req.query.location)) } : {}) } } : {}),
  ...(req.query.minValue || req.query.maxValue ? { dealValue: { gte: Number(req.query.minValue) || undefined, lte: Number(req.query.maxValue) || undefined } } : {}),
  ...(req.query.from || req.query.to ? { createdAt: { gte: req.query.from ? new Date(String(req.query.from)) : undefined, lte: req.query.to ? new Date(`${req.query.to}T23:59:59`) : undefined } } : {}),
}), dealInc, (d) => ({ ...d, probability: PROBABILITY[d.stage as keyof typeof PROBABILITY] })));
admin.get('/deals/:id', requirePerm('records:read'), async (req, res) => {
  const d = await loadOwned<any>('deal', req.params.id, req.actor, { includeDeleted: true, include: { ...dealInc, history: { orderBy: { createdAt: 'asc' } } } });
  ok(res, { ...d, timeline: await prisma.activityLog.findMany({ where: { dealId: d.id }, orderBy: { createdAt: 'desc' } }) });
});
admin.patch('/deals/:id', requirePerm('records:write'), async (req, res) => {
  const before = await loadOwned<any>('deal', req.params.id, req.actor);
  const after = req.body?.stage ? await changeStage(req.actor, before.id, req.body) : await updateDeal(req.actor, before.id, req.body);
  await audit(req, { action: 'DEAL_MODIFIED', entityType: 'DEAL', entityId: before.id, entityCode: before.code, affectedPcId: before.ownerId, before, after });
  ok(res, after);
});

admin.get('/follow-ups', requirePerm('records:read'), listOf('followUp', ['scheduledAt', 'createdAt'], (req) => ({
  ...(str(req.query.status) ? { status: req.query.status } : {}), ...(str(req.query.type) ? { type: req.query.type } : {}),
  ...(str(req.query.date) ? { scheduledAt: { gte: new Date(`${req.query.date}T00:00:00`), lt: new Date(new Date(`${req.query.date}T00:00:00`).getTime() + 86400e3) } } : {}),
  ...(q(req) ? { OR: [{ code: ci(q(req)!) }, { client: { name: ci(q(req)!) } }] } : {}),
}), { owner: pcSel, client: { select: { name: true } }, requirement: { select: { code: true } }, property: { select: { code: true } } }));
admin.patch('/follow-ups/:id', requirePerm('records:write'), async (req, res) => {
  const before = await loadOwned<any>('followUp', req.params.id, req.actor);
  const after = req.body?.action === 'reschedule' ? await R.rescheduleFollowUp(req.actor, before.id, req.body)
    : req.body?.action === 'complete' ? await R.setFollowUpStatus(req.actor, before.id, 'COMPLETED', req.body)
      : req.body?.action === 'cancel' ? await R.setFollowUpStatus(req.actor, before.id, 'CANCELLED', req.body) : await R.updateFollowUp(req.actor, before.id, req.body);
  await audit(req, { action: 'FOLLOW_UP_MODIFIED', entityType: 'FOLLOW_UP', entityId: before.id, entityCode: before.code, affectedPcId: before.ownerId, before, after });
  ok(res, after);
});

admin.get('/notifications', requirePerm('notifications:read'), async (req, res) => {
  const p = paging(req.query, ['createdAt']);
  const where: any = {};
  if (str(req.query.pcId)) where.recipientId = req.query.pcId;
  if (str(req.query.status)) where.status = req.query.status;
  const groups: Record<string, string[]> = { PROPERTY_MATCH: ['PROPERTY_MATCH'], PROPERTY_SHARE: ['PROPERTY_SHARED'], FOLLOW_UP: ['UPCOMING_FOLLOW_UP', 'DUE_FOLLOW_UP', 'MISSED_FOLLOW_UP', 'SITE_VISIT'], DEAL: ['DEAL_STAGE_UPDATE'], SYSTEM: ['SYSTEM'] };
  if (str(req.query.type)) where.type = { in: groups[String(req.query.type)] || [req.query.type] };
  const [total, items] = await Promise.all([prisma.notification.count({ where }), prisma.notification.findMany({ where, ...p, include: { recipient: pcSel } })]);
  ok(res, items, pageMeta(total, p));
});

/* ================= ACTIVITY / AUDIT (read-only) ================= */
admin.get('/activity', requirePerm('audit:read'), async (req, res) => {
  const p = paging(req.query, ['createdAt']);
  if (req.query.kind === 'audit') {
    const where: any = {};
    if (str(req.query.action)) where.action = req.query.action;
    if (str(req.query.adminId)) where.adminId = req.query.adminId;
    if (str(req.query.pcId)) where.affectedPcId = req.query.pcId;
    if (q(req)) where.OR = [{ entityCode: ci(q(req)!) }, { requirementCode: ci(q(req)!) }, { action: ci(q(req)!) }];
    const [total, items] = await Promise.all([prisma.adminAuditLog.count({ where }), prisma.adminAuditLog.findMany({ where, ...p, include: { admin: { select: { name: true, email: true } } } })]);
    return ok(res, items, pageMeta(total, p));
  }
  if (req.query.kind === 'logins') {
    const [total, items] = await Promise.all([prisma.adminLoginAttempt.count(), prisma.adminLoginAttempt.findMany({ ...p })]);
    return ok(res, items, pageMeta(total, p));
  }
  const where: any = {};
  if (str(req.query.pcId)) where.userId = req.query.pcId;
  for (const k of ['entityType', 'entityId', 'clientId', 'propertyId', 'dealId', 'requirementId'] as const) if (str(req.query[k])) where[k] = req.query[k];
  if (q(req)) where.OR = [{ description: ci(q(req)!) }, { entityCode: ci(q(req)!) }, { requirementCode: ci(q(req)!) }];
  const [total, items] = await Promise.all([prisma.activityLog.count({ where }), prisma.activityLog.findMany({ where, ...p, include: { user: { select: { name: true, pcCode: true } } } })]);
  ok(res, items, pageMeta(total, p));
});

/* ================= BIN ================= */
admin.get('/bin', requirePerm('bin:read'), async (req, res) => {
  const p = paging(req.query, ['deletedAt'], 'deletedAt');
  const where: any = { status: String(req.query.status || 'IN_BIN') };
  if (str(req.query.entityType)) where.entityType = req.query.entityType;
  if (str(req.query.pcId)) where.ownerId = req.query.pcId;
  const [total, items] = await Promise.all([prisma.binItem.count({ where }), prisma.binItem.findMany({ where, ...p })]);
  const owners = await prisma.user.findMany({ where: { id: { in: items.map((i) => i.ownerId!).filter(Boolean) } }, select: { id: true, name: true, pcCode: true } });
  ok(res, items.map((i) => ({ ...i, owner: owners.find((o) => o.id === i.ownerId) ?? null })), pageMeta(total, p));
});
admin.get('/bin/:id', requirePerm('bin:read'), async (req, res) => ok(res, await prisma.binItem.findUniqueOrThrow({ where: { id: req.params.id } })));
admin.post('/bin/:id/restore', requirePerm('bin:restore'), async (req, res) => {
  const item = await prisma.binItem.findUniqueOrThrow({ where: { id: req.params.id } });
  const restored = await restoreFromBin(req.actor, item.id);
  await audit(req, { action: `${item.entityType}_RESTORED`, entityType: item.entityType, entityId: item.entityId, entityCode: item.entityCode, requirementCode: item.entityType === 'REQUIREMENT' ? item.entityCode : null, affectedPcId: item.ownerId });
  ok(res, restored);
});
admin.post('/bin/:id/purge', requirePerm('bin:purge'), async (req, res) => {
  confirmText(req);
  const item = await prisma.binItem.findUniqueOrThrow({ where: { id: req.params.id } });
  const out = await purgeFromBin(req.actor, item.id);
  await audit(req, { action: `${item.entityType}_PERMANENTLY_DELETED`, entityType: item.entityType, entityId: item.entityId, entityCode: item.entityCode, requirementCode: item.entityType === 'REQUIREMENT' ? item.entityCode : null, affectedPcId: item.ownerId, before: item.snapshot });
  ok(res, out);
});
admin.post('/bin/bulk-purge', requirePerm('bin:purge'), async (req, res) => {
  confirmText(req);
  const ids = parse(z.array(z.string()).min(1).max(100), req.body?.ids);
  const done = [];
  for (const id of ids) {
    const item = await prisma.binItem.findUnique({ where: { id } });
    if (item?.status !== 'IN_BIN') continue;
    done.push(await purgeFromBin(req.actor, id));
    await audit(req, { action: `${item.entityType}_PERMANENTLY_DELETED`, entityType: item.entityType, entityId: item.entityId, entityCode: item.entityCode, affectedPcId: item.ownerId, after: { bulk: true } });
  }
  ok(res, { purged: done.length });
});

/* ================= LOCATIONS / AMENITIES ================= */
const locSchema = z.object({ city: z.string().trim().min(2), area: z.string().trim().min(2), locality: z.string().trim().optional().default(''), pincode: optStr, active: z.boolean().optional() });
admin.get('/locations', requirePerm('master:read'), async (req, res) => ok(res, await prisma.location.findMany({ where: q(req) ? { OR: [{ area: ci(q(req)!) }, { city: ci(q(req)!) }, { locality: ci(q(req)!) }] } : {}, orderBy: [{ city: 'asc' }, { area: 'asc' }] })));
admin.post('/locations', requirePerm('master:write'), async (req, res) => {
  const loc = await prisma.location.create({ data: parse(locSchema, req.body) });
  await audit(req, { action: 'LOCATION_CREATED', entityType: 'LOCATION', entityId: loc.id, after: loc });
  ok(res, loc, undefined, 201);
});
admin.patch('/locations/:id', requirePerm('master:write'), async (req, res) => {
  const before = await prisma.location.findUniqueOrThrow({ where: { id: req.params.id } });
  const loc = await prisma.location.update({ where: { id: before.id }, data: parse(locSchema.partial(), req.body) });
  await audit(req, { action: 'LOCATION_UPDATED', entityType: 'LOCATION', entityId: loc.id, before, after: loc });
  ok(res, loc);
});
const amSchema = z.object({ name: z.string().trim().min(2), icon: optStr, active: z.boolean().optional() });
admin.get('/amenities', requirePerm('master:read'), async (_req, res) => ok(res, await prisma.amenity.findMany({ orderBy: { name: 'asc' } })));
admin.post('/amenities', requirePerm('master:write'), async (req, res) => {
  const a = await prisma.amenity.create({ data: parse(amSchema, req.body) });
  await audit(req, { action: 'AMENITY_CREATED', entityType: 'AMENITY', entityId: a.id, after: a });
  ok(res, a, undefined, 201);
});
admin.patch('/amenities/:id', requirePerm('master:write'), async (req, res) => {
  const before = await prisma.amenity.findUniqueOrThrow({ where: { id: req.params.id } });
  const input = parse(amSchema.partial(), req.body);
  const a = await prisma.$transaction(async (tx) => {
    const updated = await tx.amenity.update({ where: { id: before.id }, data: input });
    if (input.name && input.name !== before.name) {
      // keep existing property / requirement references consistent on rename
      await tx.$executeRaw`UPDATE "Property" SET amenities = array_replace(amenities, ${before.name}, ${input.name})`;
      await tx.$executeRaw`UPDATE "Requirement" SET amenities = array_replace(amenities, ${before.name}, ${input.name})`;
    }
    return updated;
  });
  await audit(req, { action: 'AMENITY_UPDATED', entityType: 'AMENITY', entityId: a.id, before, after: a });
  ok(res, a);
});

/* ================= SETTINGS / PROVIDERS ================= */
const mask = (v?: string) => (v ? `••••${v.slice(-4)}` : null);
admin.get('/settings', requirePerm('settings:read'), async (_req, res) => {
  const [settings, providers] = await Promise.all([prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }), prisma.providerConfig.findMany({ orderBy: { kind: 'asc' } })]);
  const merged = Object.entries(DEFAULT_SETTINGS).map(([key, d]) => settings.find((s) => s.key === key) ?? { key, category: d.category, value: d.value, updatedAt: null, updatedBy: null });
  ok(res, {
    settings: merged,
    providers: providers.map((p) => ({ ...p, activeProvider: process.env[`${p.kind}_PROVIDER`] || p.provider, secrets: p.secretEnv.map((name) => ({ name, configured: !!process.env[name], masked: mask(process.env[name]) })) })),
  });
});
admin.put('/settings/:key', requirePerm('settings:write'), async (req, res) => {
  const key = req.params.key;
  if (!DEFAULT_SETTINGS[key]) throw notFound('Setting');
  if (req.body?.confirm !== true) throw badRequest('Confirmation required to change system configuration');
  const value = req.body?.value;
  if (typeof value !== typeof DEFAULT_SETTINGS[key].value) throw fieldError({ value: `Expected a ${typeof DEFAULT_SETTINGS[key].value}` });
  const before = await prisma.systemSetting.findUnique({ where: { key } });
  const row = await prisma.systemSetting.upsert({ where: { key }, create: { key, category: DEFAULT_SETTINGS[key].category, value, updatedBy: req.admin!.email }, update: { value, updatedBy: req.admin!.email } });
  await audit(req, { action: 'SYSTEM_SETTING_CHANGED', entityType: 'SETTING', entityId: key, before: before?.value ?? DEFAULT_SETTINGS[key].value, after: value });
  ok(res, row);
});
admin.patch('/providers/:kind', requirePerm('settings:write'), async (req, res) => {
  if (req.body?.confirm !== true) throw badRequest('Confirmation required to change system configuration');
  const input = parse(z.object({ enabled: z.boolean().optional(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional() }), req.body);
  if (input.config && Object.keys(input.config).some((k) => /secret|key|token|password/i.test(k))) throw badRequest('Secrets must be configured via server environment variables');
  const before = await prisma.providerConfig.findUniqueOrThrow({ where: { kind: req.params.kind } });
  const row = await prisma.providerConfig.update({ where: { kind: before.kind }, data: { enabled: input.enabled, config: input.config as any } });
  await audit(req, { action: 'SYSTEM_SETTING_CHANGED', entityType: 'PROVIDER', entityId: before.kind, before: { enabled: before.enabled, config: before.config }, after: { enabled: row.enabled, config: row.config } });
  ok(res, row);
});

/* ================= ADMIN USERS ================= */
const roleEnum = z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'READ_ONLY_ADMIN']);
admin.get('/users', requirePerm('admins:manage'), async (_req, res) => ok(res, (await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })).map(adminView)));
admin.post('/users', requirePerm('admins:manage'), async (req, res) => {
  const input = parse(z.object({ name: z.string().trim().min(2), email: z.string().email().transform((e) => e.toLowerCase()), role: roleEnum, password: z.string().min(10, 'Use at least 10 characters') }), req.body);
  const a = await prisma.adminUser.create({ data: { name: input.name, email: input.email, role: input.role, passwordHash: await bcrypt.hash(input.password, 12) } });
  await audit(req, { action: 'ADMIN_USER_CREATED', entityType: 'ADMIN', entityId: a.id, after: adminView(a) });
  ok(res, adminView(a), undefined, 201);
});
admin.patch('/users/:id', requirePerm('admins:manage'), async (req, res) => {
  const input = parse(z.object({ name: z.string().trim().min(2).optional(), role: roleEnum.optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional(), password: z.string().min(10).optional() }), req.body);
  const before = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.params.id } });
  if (before.id === req.admin!.id && (input.role && input.role !== before.role || input.status === 'DISABLED')) throw forbidden('You cannot change your own role or disable yourself');
  const { password, ...rest } = input;
  const a = await prisma.adminUser.update({ where: { id: before.id }, data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) } });
  if (input.status === 'DISABLED') await prisma.session.updateMany({ where: { adminId: a.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(req, { action: 'ADMIN_USER_UPDATED', entityType: 'ADMIN', entityId: a.id, before: adminView(before), after: adminView(a) });
  ok(res, adminView(a));
});

/* ================= CSV EXPORT (never includes secrets) ================= */
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};
admin.get('/export/:entity', requirePerm('export'), async (req, res) => {
  const e = req.params.entity;
  const nd = { deletedAt: null };
  let rows: Record<string, unknown>[] = [];
  if (e === 'pcs') rows = (await prisma.user.findMany({ include: { profile: true } })).map((u) => ({ pcCode: u.pcCode, name: u.name, phone: u.phone, email: u.email, company: u.profile?.companyName, rera: u.profile?.reraNumber, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt }));
  else if (e === 'clients') rows = (await prisma.client.findMany({ where: nd, include: { owner: pcSel } })).map((c) => ({ code: c.code, name: c.name, phone: c.phone, email: c.email, location: c.location, pc: c.owner.name, pcCode: c.owner.pcCode, createdAt: c.createdAt }));
  else if (e === 'properties') rows = (await prisma.property.findMany({ where: nd, include: { owner: pcSel, transactions: true } })).map((p) => ({ code: p.code, category: p.category, subtype: p.subtype, location: p.location, area: p.area, dimensions: p.dimLength ? `${p.dimLength}x${p.dimWidth} ${p.dimUnit}` : '', transactions: p.transactions.map((t) => `${t.kind}:${txPrice(t)}`).join(' | '), status: p.status, pc: p.owner.name, createdAt: p.createdAt }));
  else if (e === 'requirements') rows = (await prisma.requirement.findMany({ where: nd, include: { owner: pcSel, client: { select: { name: true } } } })).map((r) => ({ code: r.code, client: r.client.name, pc: r.owner.name, type: r.type, category: r.category, subtype: r.subtype, location: r.location, amount: r.amount, status: r.status, createdAt: r.createdAt }));
  else if (e === 'deals') rows = (await prisma.deal.findMany({ where: nd, include: dealInc })).map((d) => ({ code: d.code, client: d.client.name, requirement: d.requirement.code, property: d.property.code, pc: d.owner.name, stage: d.stage, dealValue: d.dealValue, expectedCommission: d.expectedCommission, finalCommission: d.finalCommission, createdAt: d.createdAt, closingDate: d.closingDate }));
  else if (e === 'follow-ups') rows = (await prisma.followUp.findMany({ where: nd, include: { owner: pcSel, client: { select: { name: true } }, requirement: { select: { code: true } }, property: { select: { code: true } } } })).map((f) => ({ code: f.code, pc: f.owner.name, client: f.client.name, requirement: f.requirement?.code, property: f.property?.code, scheduledAt: f.scheduledAt, type: f.type, status: f.status }));
  else if (e === 'analytics') {
    const a = await computeAnalytics({});
    rows = [...Object.entries(a.totals).map(([metric, value]) => ({ section: 'totals', metric, value })), ...a.growth.flatMap((g) => Object.entries(g).filter(([k]) => k !== 'month').map(([metric, value]) => ({ section: `growth ${g.month}`, metric, value })))];
  } else throw notFound('Export');
  await audit(req, { action: 'DATA_EXPORTED', entityType: e.toUpperCase(), after: { rows: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${e}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv(rows));
});
