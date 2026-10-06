import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AppError, badRequest, ci, fieldError, forbidden, isIndianMobile, normalizePhone, notFound, ok, pageMeta, paging, parse, str } from '../lib/http';
import { nextCode } from '../lib/codes';
import { canViewProperty, loadOwned } from '../lib/scope';
import { logActivity } from '../lib/activity';
import { getSetting } from '../lib/settings';
import { issueSession, pcAuth } from '../middleware/auth';
import { otpLimiter } from '../middleware/security';
import { otpProvider } from '../providers/otp';
import { ALLOWED_IMAGE_TYPES, isValidImage, storage } from '../providers/storage';
import * as R from '../services/records';
import { changeStage, createDeal, createLink, linkSchema, PROBABILITY, STAGES, updateDeal } from '../services/deals';
import { allMatchesForOwner, matchesForRequirement } from '../services/matching';
import { moveToBin, purgeFromBin, restoreFromBin } from '../services/bin';
import { clientAnalytics, computeAnalytics, propertyAnalytics } from '../services/analytics';
import { globalSearch } from '../services/search';
import { optStr } from '../services/validation';

export const pc = Router();
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
  fileFilter: (_r, f, cb) => (ALLOWED_IMAGE_TYPES.includes(f.mimetype) ? cb(null, true) : cb(new AppError(400, 'UPLOAD_ERROR', `Unsupported file type ${f.mimetype}. Use JPG, PNG, WEBP or HEIC.`))),
});
const me = (req: any) => req.actor.userId as string;
const hashOtp = (phone: string, code: string) => crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
const userView = (u: any) => ({ id: u.id, pcCode: u.pcCode, phone: u.phone, name: u.name, email: u.email, status: u.status, onboarded: u.onboarded, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, profile: u.profile });

/* ================= AUTH (phone + OTP only) ================= */
const phoneBody = z.object({ phone: z.string().transform(normalizePhone).refine(isIndianMobile, 'Enter a valid 10-digit Indian mobile number') });

pc.post('/auth/send-otp', otpLimiter, async (req, res) => {
  const { phone } = parse(phoneBody, req.body);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (user && user.status !== 'ACTIVE') throw new AppError(403, `ACCOUNT_${user.status}`, user.status === 'SUSPENDED' ? 'Your account has been suspended. Please contact support.' : 'Your account has been deactivated.');
  if (!user && !(await getSetting<boolean>('auth.allowSelfSignup'))) throw forbidden('This number is not registered. Contact your administrator.');
  const recent = await prisma.otpCode.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60e3) } } });
  if (recent >= 5 && !config.isTest) throw new AppError(429, 'RATE_LIMITED', 'Too many OTP requests. Try again in a few minutes.');
  const code = otpProvider.generate();
  const ttl = await getSetting<number>('auth.otpExpirySeconds');
  await prisma.otpCode.create({ data: { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + ttl * 1000) } });
  await otpProvider.send(phone, code);
  ok(res, { sent: true, phone, expiresIn: ttl, isRegistered: !!user, ...(otpProvider.name === 'mock' && !config.isProd ? { devCode: code } : {}) });
});

pc.post('/auth/verify-otp', otpLimiter, async (req, res) => {
  const { phone, code } = parse(phoneBody.extend({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP') }), req.body);
  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) throw badRequest('OTP expired. Please request a new one.');
  if (otp.attempts >= (await getSetting<number>('auth.maxOtpAttempts'))) throw new AppError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new OTP.');
  if (otp.codeHash !== hashOtp(phone, code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw fieldError({ code: 'Incorrect OTP' });
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  let user = await prisma.user.findUnique({ where: { phone }, include: { profile: true } });
  const isNew = !user;
  if (!user) user = await prisma.user.create({ data: { phone, pcCode: await nextCode('PC'), profile: { create: { whatsappNumber: phone } } }, include: { profile: true } });
  if (user.status !== 'ACTIVE') throw new AppError(403, `ACCOUNT_${user.status}`, user.status === 'SUSPENDED' ? 'Your account has been suspended. Please contact support.' : 'Your account has been deactivated.');
  const previousLogin = user.lastLoginAt;
  user = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: { profile: true } });
  const { token, expiresAt } = await issueSession('PC', user.id, req);
  ok(res, { token, expiresAt, user: userView(user), isNewUser: isNew, showOnboarding: !user.onboarded, previousLogin });
});

pc.use(pcAuth);

pc.post('/auth/logout', async (req, res) => {
  await prisma.session.update({ where: { id: req.sessionId! }, data: { revokedAt: new Date() } });
  ok(res, { loggedOut: true });
});
pc.get('/auth/me', async (req, res) => ok(res, userView(await prisma.user.findUniqueOrThrow({ where: { id: me(req) }, include: { profile: true } }))));
pc.post('/auth/onboarding/complete', async (req, res) => ok(res, userView(await prisma.user.update({ where: { id: me(req) }, data: { onboarded: true }, include: { profile: true } }))));

/* ================= PROFILE / USERS ================= */
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120).optional(),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email('Enter a valid email').nullable().optional()),
  companyName: optStr, reraNumber: optStr, officeAddress: optStr, companyWebsite: optStr, gstNumber: optStr,
  whatsappNumber: z.preprocess((v) => (v ? normalizePhone(String(v)) : null), z.string().refine(isIndianMobile, 'Enter a valid WhatsApp number').nullable().optional()),
  areasOfOperation: z.array(z.string().max(80)).max(30).optional(), settings: z.record(z.string(), z.unknown()).optional(),
});
pc.get('/profile', async (req, res) => ok(res, userView(await prisma.user.findUniqueOrThrow({ where: { id: me(req) }, include: { profile: true } }))));
pc.patch('/profile', async (req, res) => {
  const { name, email, ...profile } = parse(profileSchema, req.body);
  const user = await prisma.user.update({
    where: { id: me(req) },
    data: { name, email, profile: { upsert: { create: profile as any, update: profile as any } } }, include: { profile: true },
  });
  ok(res, userView(user));
});
pc.post('/profile/photo', upload.single('photo') as any, async (req, res) => {
  const f = req.file;
  if (!f || !isValidImage(f.buffer, f.mimetype)) throw badRequest('Please upload a valid image');
  const saved = await storage.save(`avatars/${me(req)}-${Date.now()}.${f.mimetype.split('/')[1]}`, f.buffer, f.mimetype);
  await prisma.pCProfile.update({ where: { userId: me(req) }, data: { photoUrl: saved.url } });
  ok(res, { photoUrl: saved.url });
});
pc.get('/users/lookup', async (req, res) => {
  const phone = normalizePhone(String(req.query.phone || ''));
  if (!isIndianMobile(phone)) throw fieldError({ phone: 'Enter a valid 10-digit mobile number' });
  const u = await prisma.user.findFirst({ where: { phone, status: 'ACTIVE' }, include: { profile: { select: { companyName: true } } } });
  ok(res, { registered: !!u && u.id !== me(req), self: u?.id === me(req), name: u?.name ?? null, company: u?.profile?.companyName ?? null });
});

/* ================= CLIENTS ================= */
pc.get('/clients', async (req, res) => {
  const p = paging(req.query, ['createdAt', 'updatedAt', 'name']);
  const q = str(req.query.q);
  const where: any = { ownerId: me(req), deletedAt: null };
  if (q) where.OR = [{ name: ci(q) }, { phone: { contains: q } }, { location: ci(q) }, { code: ci(q) }];
  if (req.query.hot === 'true') where.isHot = true;
  if (str(req.query.location)) where.location = ci(String(req.query.location));
  const [total, items] = await Promise.all([prisma.client.count({ where }), prisma.client.findMany({
    where, ...p,
    include: { _count: { select: { requirements: { where: { deletedAt: null } }, links: { where: { status: 'ACTIVE' } }, deals: { where: { deletedAt: null, stage: { notIn: ['CLOSED', 'LOST'] } } } } } },
  })]);
  ok(res, items, pageMeta(total, p));
});
pc.post('/clients', async (req, res) => ok(res, await R.createClient(req.actor, me(req), req.body), undefined, 201));
pc.get('/clients/:id', async (req, res) => {
  const c = await loadOwned<any>('client', req.params.id, req.actor);
  const [requirements, links, deals, followUps] = await Promise.all([
    prisma.requirement.findMany({ where: { clientId: c.id, deletedAt: null }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { links: { where: { status: 'ACTIVE' } } } } } }),
    prisma.propertyClient.findMany({ where: { clientId: c.id, status: 'ACTIVE', property: { deletedAt: null } }, include: { property: { include: { photos: { take: 1, orderBy: { position: 'asc' } }, transactions: true } }, requirement: { select: { code: true, type: true } } } }),
    prisma.deal.findMany({ where: { clientId: c.id, deletedAt: null }, include: { property: { select: { code: true, location: true, subtype: true } }, requirement: { select: { code: true } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.followUp.findMany({ where: { clientId: c.id, deletedAt: null }, include: { requirement: { select: { code: true } }, property: { select: { code: true } } }, orderBy: { scheduledAt: 'desc' } }),
  ]);
  ok(res, { ...c, requirements, links, deals, followUps });
});
pc.patch('/clients/:id', async (req, res) => ok(res, await R.updateClient(req.actor, req.params.id, req.body)));
pc.delete('/clients/:id', async (req, res) => ok(res, await moveToBin(req.actor, 'CLIENT', await loadOwned('client', req.params.id, req.actor), str(req.body?.reason))));
pc.get('/clients/:id/analytics', async (req, res) => {
  const c = await loadOwned<any>('client', req.params.id, req.actor);
  ok(res, await clientAnalytics(c.id, c.ownerId));
});

/* ================= REQUIREMENTS ================= */
pc.get('/requirements', async (req, res) => {
  const p = paging(req.query, ['createdAt', 'updatedAt', 'code']);
  const where: any = { ownerId: me(req), deletedAt: null, client: { deletedAt: null } };
  if (str(req.query.clientId)) where.clientId = req.query.clientId;
  if (str(req.query.type)) where.type = req.query.type;
  if (str(req.query.status)) where.status = req.query.status;
  const [total, items] = await Promise.all([prisma.requirement.count({ where }), prisma.requirement.findMany({ where, ...p, include: { client: { select: { id: true, name: true, phone: true } } } })]);
  ok(res, items, pageMeta(total, p));
});
pc.post('/requirements', async (req, res) => ok(res, await R.createRequirement(req.actor, req.body), undefined, 201));
pc.get('/requirements/:id', async (req, res) => {
  const r = await loadOwned<any>('requirement', req.params.id, req.actor, { include: { client: true } });
  const [links, deals, followUps] = await Promise.all([
    prisma.propertyClient.findMany({ where: { requirementId: r.id, status: 'ACTIVE' }, include: { property: { include: { photos: { take: 1, orderBy: { position: 'asc' } }, transactions: true } } } }),
    prisma.deal.findMany({ where: { requirementId: r.id, deletedAt: null }, include: { property: { select: { code: true, location: true } } } }),
    prisma.followUp.findMany({ where: { requirementId: r.id, deletedAt: null }, orderBy: { scheduledAt: 'desc' } }),
  ]);
  ok(res, { ...r, links, deals, followUps });
});
pc.patch('/requirements/:id', async (req, res) => ok(res, await R.updateRequirement(req.actor, req.params.id, req.body)));
pc.delete('/requirements/:id', async (req, res) => ok(res, await moveToBin(req.actor, 'REQUIREMENT', await loadOwned('requirement', req.params.id, req.actor), str(req.body?.reason))));
pc.post('/requirements/:id/duplicate', async (req, res) => ok(res, await R.duplicateRequirement(req.actor, req.params.id), undefined, 201));
pc.get('/requirements/:id/matches', async (req, res) => ok(res, await matchesForRequirement(await loadOwned('requirement', req.params.id, req.actor))));

/* ================= PROPERTIES ================= */
const listInclude = (uid: string) => ({
  photos: { orderBy: { position: 'asc' as const }, take: 1 }, transactions: true,
  owner: { select: { id: true, name: true, pcCode: true } },
  _count: { select: { links: { where: { status: 'ACTIVE' as const } } } },
  shares: { where: { OR: [{ senderId: uid }, { receiverId: uid }] }, select: { id: true, senderId: true, receiverId: true }, take: 3 },
  deals: { where: { deletedAt: null }, select: { stage: true }, orderBy: { updatedAt: 'desc' as const }, take: 1 },
});
pc.get('/properties', async (req, res) => {
  const p = paging(req.query, ['createdAt', 'updatedAt', 'area', 'code']);
  const uid = me(req);
  const scope = String(req.query.scope || 'mine');
  const where: any = { deletedAt: null };
  if (scope === 'shared') where.shares = { some: { receiverId: uid, status: { not: 'REVOKED' } } };
  else if (scope === 'all') where.OR = [{ ownerId: uid }, { shares: { some: { receiverId: uid } } }];
  else where.ownerId = uid;
  const q = str(req.query.q);
  if (q) where.AND = [{ OR: [{ code: ci(q) }, { location: ci(q) }, { locality: ci(q) }, { title: ci(q) }, { subtype: ci(q) }] }];
  for (const k of ['category', 'subtype', 'status'] as const) if (str(req.query[k])) where[k] = req.query[k];
  if (str(req.query.location)) where.location = ci(String(req.query.location));
  if (str(req.query.bhk)) where.bhk = Number(req.query.bhk);
  const kind = str(req.query.kind);
  const min = Number(req.query.minPrice) || undefined; const max = Number(req.query.maxPrice) || undefined;
  if (kind || min || max) {
    const range = min || max ? { gte: min, lte: max } : undefined;
    where.transactions = { some: { ...(kind ? { kind } : {}), ...(range ? { OR: [{ salePrice: range }, { rentAmount: range }, { leaseAmount: range }] } : {}) } };
  }
  if (req.query.shared === 'true') where.shares = { some: { OR: [{ senderId: uid }, { receiverId: uid }] } };
  const [total, items] = await Promise.all([prisma.property.count({ where }), prisma.property.findMany({ where, ...p, include: listInclude(uid) })]);
  ok(res, items.map((i) => ({ ...i, isShared: i.shares.length > 0, access: i.ownerId === uid ? 'OWNER' : 'VIEW_ONLY', dealStatus: i.deals[0]?.stage ?? null, interestedClients: i._count.links })), pageMeta(total, p));
});
pc.post('/properties', async (req, res) => ok(res, await R.createProperty(req.actor, me(req), req.body), undefined, 201));
pc.get('/properties/:id', async (req, res) => {
  const prop = await prisma.property.findFirst({ where: { OR: [{ id: req.params.id }, { code: req.params.id }], deletedAt: null }, include: R.propertyDetailInclude });
  if (!prop) throw notFound('Property');
  const access = await canViewProperty(req.actor, prop);
  if (!access) throw forbidden();
  if (access === 'VIEW_ONLY') {
    await prisma.propertyShare.updateMany({ where: { propertyId: prop.id, receiverId: me(req), status: 'SENT' }, data: { status: 'VIEWED' } });
    return ok(res, { ...prop, links: [], deals: [], shares: prop.shares.filter((s) => s.receiverId === me(req)), access, isShared: true });
  }
  ok(res, { ...prop, access, isShared: prop.shares.length > 0 });
});
pc.patch('/properties/:id', async (req, res) => ok(res, await R.updateProperty(req.actor, req.params.id, req.body)));
pc.delete('/properties/:id', async (req, res) => ok(res, await moveToBin(req.actor, 'PROPERTY', await loadOwned('property', req.params.id, req.actor), str(req.body?.reason))));
pc.get('/properties/:id/analytics', async (req, res) => ok(res, await propertyAnalytics((await loadOwned<any>('property', req.params.id, req.actor)).id)));

/* ---- photos ---- */
pc.post('/properties/:id/photos', upload.array('photos', 20) as any, async (req, res) => {
  const prop = await loadOwned<any>('property', req.params.id, req.actor);
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) throw badRequest('No photos uploaded');
  const existing = await prisma.propertyPhoto.count({ where: { propertyId: prop.id } });
  if (existing + files.length > 30) throw badRequest('A property can have at most 30 photos');
  const created = [];
  for (const [i, f] of files.entries()) {
    if (!isValidImage(f.buffer, f.mimetype)) throw badRequest(`${f.originalname} is not a valid image`);
    const key = `properties/${prop.id}/${crypto.randomUUID()}.${f.mimetype.split('/')[1].replace('jpeg', 'jpg')}`;
    const saved = await storage.save(key, f.buffer, f.mimetype);
    created.push(await prisma.propertyPhoto.create({ data: { propertyId: prop.id, url: saved.url, storageKey: saved.key, mimeType: f.mimetype, size: f.size, position: existing + i } }));
  }
  await logActivity(req.actor, { entityType: 'PROPERTY', entityId: prop.id, entityCode: prop.code, ownerId: prop.ownerId, propertyId: prop.id, action: 'PROPERTY_EDITED', description: `${created.length} photo(s) added to ${prop.code}` });
  ok(res, created, undefined, 201);
});
pc.patch('/properties/:id/photos/order', async (req, res) => {
  const prop = await loadOwned<any>('property', req.params.id, req.actor);
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1) }), req.body);
  const photos = await prisma.propertyPhoto.findMany({ where: { propertyId: prop.id } });
  if (ids.length !== photos.length || !ids.every((id) => photos.some((p) => p.id === id))) throw badRequest('Photo list does not match');
  await prisma.$transaction(ids.map((id, position) => prisma.propertyPhoto.update({ where: { id }, data: { position } })));
  ok(res, await prisma.propertyPhoto.findMany({ where: { propertyId: prop.id }, orderBy: { position: 'asc' } }));
});
pc.delete('/property-photos/:id', async (req, res) => {
  const photo = await prisma.propertyPhoto.findUnique({ where: { id: req.params.id } });
  if (!photo) throw notFound('Photo');
  await loadOwned('property', photo.propertyId, req.actor);
  await prisma.propertyPhoto.delete({ where: { id: photo.id } });
  await storage.remove(photo.storageKey).catch(() => undefined);
  ok(res, { deleted: true });
});

/* ---- transactions ---- */
pc.get('/properties/:id/transactions', async (req, res) => ok(res, (await loadOwned<any>('property', req.params.id, req.actor, { include: { transactions: true } })).transactions));
pc.put('/properties/:id/transactions', async (req, res) => ok(res, await R.updateProperty(req.actor, req.params.id, { transactions: req.body?.transactions })));

/* ================= SHARES ================= */
pc.post('/property-shares', async (req, res) => ok(res, await R.shareProperty(req.actor, req.body), undefined, 201));
pc.get('/property-shares', async (req, res) => {
  const where = req.query.direction === 'received' ? { receiverId: me(req) } : { senderId: me(req) };
  ok(res, await prisma.propertyShare.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { property: { select: { id: true, code: true, location: true, subtype: true } }, sender: { select: { name: true, phone: true } }, receiver: { select: { name: true, phone: true } } } }));
});

/* ================= LINKS ================= */
pc.get('/property-client-links', async (req, res) => {
  const where: any = { ownerId: me(req), status: req.query.status === 'UNLINKED' ? 'UNLINKED' : 'ACTIVE' };
  for (const k of ['clientId', 'propertyId', 'requirementId'] as const) if (str(req.query[k])) where[k] = req.query[k];
  ok(res, await prisma.propertyClient.findMany({ where, include: { client: { select: { name: true, phone: true } }, property: { select: { code: true, location: true, subtype: true } }, requirement: { select: { code: true, type: true } } }, orderBy: { createdAt: 'desc' } }));
});
pc.post('/property-client-links', async (req, res) => ok(res, await createLink(req.actor, parse(linkSchema, req.body)), undefined, 201));
pc.patch('/property-client-links/:id', async (req, res) => {
  const link = await loadOwned<any>('propertyClient', req.params.id, req.actor);
  const input = parse(linkSchema.pick({ interestLevel: true, notes: true, dealValue: true, commission: true }).partial(), req.body);
  ok(res, await prisma.propertyClient.update({ where: { id: link.id }, data: input }));
});
pc.delete('/property-client-links/:id', async (req, res) => {
  const link = await loadOwned<any>('propertyClient', req.params.id, req.actor, { include: { property: true, requirement: true } });
  const updated = await prisma.propertyClient.update({ where: { id: link.id }, data: { status: 'UNLINKED' } });
  await logActivity(req.actor, { entityType: 'LINK', entityId: link.id, ownerId: link.ownerId, action: 'PROPERTY_UNLINKED', description: `${link.property.code} unlinked from ${link.requirement.code}`, requirementId: link.requirementId, requirementCode: link.requirement.code, clientId: link.clientId, propertyId: link.propertyId });
  ok(res, updated);
});

/* ================= DEALS ================= */
const dealInclude = { client: { select: { id: true, name: true, phone: true } }, property: { select: { id: true, code: true, location: true, subtype: true, category: true } }, requirement: { select: { id: true, code: true, type: true } } };
pc.get('/deals', async (req, res) => {
  const p = paging(req.query, ['createdAt', 'updatedAt', 'dealValue'], 'updatedAt');
  const where: any = { ownerId: me(req), deletedAt: null };
  for (const k of ['stage', 'clientId', 'propertyId', 'requirementId'] as const) if (str(req.query[k])) where[k] = req.query[k];
  if (req.query.open === 'true') where.stage = { notIn: ['CLOSED', 'LOST'] };
  const [total, items] = await Promise.all([prisma.deal.count({ where }), prisma.deal.findMany({ where, ...p, include: dealInclude })]);
  ok(res, items.map((d) => ({ ...d, probability: PROBABILITY[d.stage] })), pageMeta(total, p));
});
pc.post('/deals', async (req, res) => ok(res, await createDeal(req.actor, req.body), undefined, 201));
pc.get('/deals/:id', async (req, res) => {
  const d = await loadOwned<any>('deal', req.params.id, req.actor, { include: { ...dealInclude, history: { orderBy: { createdAt: 'asc' } }, followUps: { where: { deletedAt: null }, orderBy: { scheduledAt: 'desc' } } } });
  const timeline = await prisma.activityLog.findMany({ where: { dealId: d.id }, orderBy: { createdAt: 'desc' } });
  ok(res, { ...d, probability: PROBABILITY[d.stage as keyof typeof PROBABILITY], timeline, stages: STAGES });
});
pc.patch('/deals/:id', async (req, res) => ok(res, await updateDeal(req.actor, req.params.id, req.body)));
pc.post('/deals/:id/stage', async (req, res) => ok(res, await changeStage(req.actor, req.params.id, req.body)));
pc.delete('/deals/:id', async (req, res) => ok(res, await moveToBin(req.actor, 'DEAL', await loadOwned('deal', req.params.id, req.actor), str(req.body?.reason))));

/* ================= FOLLOW-UPS ================= */
pc.get('/follow-ups', async (req, res) => {
  const p = paging(req.query, ['scheduledAt', 'createdAt'], 'scheduledAt');
  const where: any = { ownerId: me(req), deletedAt: null };
  const now = new Date(); const sod = new Date(now); sod.setHours(0, 0, 0, 0); const eod = new Date(sod.getTime() + 86400e3);
  const view = String(req.query.view || '');
  if (view === 'today') where.scheduledAt = { gte: sod, lt: eod };
  if (view === 'upcoming') { where.scheduledAt = { gte: now }; where.status = { in: ['SCHEDULED', 'RESCHEDULED'] }; }
  if (view === 'overdue') where.status = 'MISSED';
  if (view === 'completed') where.status = 'COMPLETED';
  for (const k of ['status', 'type', 'clientId', 'requirementId', 'propertyId', 'dealId'] as const) if (str(req.query[k])) where[k] = req.query[k];
  const order = view === 'completed' ? 'desc' : (req.query.order === 'desc' ? 'desc' : 'asc');
  const [total, items] = await Promise.all([prisma.followUp.count({ where }), prisma.followUp.findMany({ where, skip: p.skip, take: p.take, orderBy: { scheduledAt: order }, include: { client: { select: { id: true, name: true, phone: true } }, requirement: { select: { id: true, code: true } }, property: { select: { id: true, code: true, location: true } }, deal: { select: { id: true, code: true } } } })]);
  ok(res, items, pageMeta(total, p));
});
pc.post('/follow-ups', async (req, res) => ok(res, await R.createFollowUp(req.actor, req.body), undefined, 201));
pc.get('/follow-ups/:id', async (req, res) => ok(res, await loadOwned('followUp', req.params.id, req.actor, { include: { client: true, requirement: true, property: true, deal: true, notifications: { orderBy: { scheduledFor: 'asc' } } } })));
pc.patch('/follow-ups/:id', async (req, res) => ok(res, await R.updateFollowUp(req.actor, req.params.id, req.body)));
pc.post('/follow-ups/:id/reschedule', async (req, res) => ok(res, await R.rescheduleFollowUp(req.actor, req.params.id, req.body)));
pc.post('/follow-ups/:id/complete', async (req, res) => ok(res, await R.setFollowUpStatus(req.actor, req.params.id, 'COMPLETED', req.body)));
pc.post('/follow-ups/:id/cancel', async (req, res) => ok(res, await R.setFollowUpStatus(req.actor, req.params.id, 'CANCELLED', req.body)));
pc.get('/follow-ups/:id/whatsapp', async (req, res) => ok(res, await R.followUpWhatsApp(req.actor, req.params.id)));
pc.delete('/follow-ups/:id', async (req, res) => {
  const fu = await loadOwned<any>('followUp', req.params.id, req.actor, { include: { requirement: { select: { code: true } } } });
  await prisma.followUp.update({ where: { id: fu.id }, data: { deletedAt: new Date() } });
  await prisma.notification.updateMany({ where: { followUpId: fu.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  await logActivity(req.actor, { entityType: 'FOLLOW_UP', entityId: fu.id, entityCode: fu.code, ownerId: fu.ownerId, clientId: fu.clientId, requirementId: fu.requirementId, requirementCode: fu.requirement?.code, action: 'FOLLOW_UP_DELETED', description: `Follow-up ${fu.code} deleted` });
  ok(res, { deleted: true });
});

/* ================= NOTIFICATIONS ================= */
pc.get('/notifications', async (req, res) => {
  const p = paging(req.query, ['createdAt']);
  const where: any = { recipientId: me(req), status: { in: ['DELIVERED', 'READ'] } };
  if (req.query.unread === 'true') where.status = 'DELIVERED';
  const [total, unread, items] = await Promise.all([prisma.notification.count({ where }), prisma.notification.count({ where: { recipientId: me(req), status: 'DELIVERED' } }), prisma.notification.findMany({ where, skip: p.skip, take: p.take, orderBy: { deliveredAt: 'desc' } })]);
  ok(res, items, { ...pageMeta(total, p), unread });
});
pc.get('/notifications/scheduled', async (req, res) => ok(res, await prisma.notification.findMany({ where: { recipientId: me(req), status: 'PENDING' }, orderBy: { scheduledFor: 'asc' }, take: 50 })));
pc.post('/notifications/read-all', async (req, res) => ok(res, await prisma.notification.updateMany({ where: { recipientId: me(req), status: 'DELIVERED' }, data: { status: 'READ', readAt: new Date() } })));
pc.post('/notifications/:id/read', async (req, res) => {
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n) throw notFound('Notification');
  if (n.recipientId !== me(req)) throw forbidden();
  ok(res, await prisma.notification.update({ where: { id: n.id }, data: { status: 'READ', readAt: n.readAt ?? new Date() } }));
});

/* ================= DASHBOARD / ANALYTICS / SEARCH ================= */
pc.get('/dashboard', async (req, res) => {
  const uid = me(req);
  const sod = new Date(); sod.setHours(0, 0, 0, 0); const eod = new Date(sod.getTime() + 86400e3);
  const [properties, clients, todays, siteVisits, openDeals, recentProperties, recentActivity, hotClients, matches] = await Promise.all([
    prisma.property.count({ where: { ownerId: uid, deletedAt: null } }),
    prisma.client.count({ where: { ownerId: uid, deletedAt: null } }),
    prisma.followUp.findMany({ where: { ownerId: uid, deletedAt: null, scheduledAt: { gte: sod, lt: eod } }, orderBy: { scheduledAt: 'asc' }, include: { client: { select: { id: true, name: true, phone: true } }, requirement: { select: { code: true } } } }),
    prisma.followUp.findMany({ where: { ownerId: uid, deletedAt: null, type: 'SITE_VISIT', status: { in: ['SCHEDULED', 'RESCHEDULED'] }, scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 5, include: { client: { select: { name: true } }, property: { select: { code: true, location: true } } } }),
    prisma.deal.findMany({ where: { ownerId: uid, deletedAt: null, stage: { notIn: ['CLOSED', 'LOST'] } }, select: { stage: true, dealValue: true, expectedCommission: true } }),
    prisma.property.findMany({ where: { ownerId: uid, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 6, include: listInclude(uid) }),
    prisma.activityLog.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.client.findMany({ where: { ownerId: uid, deletedAt: null, OR: [{ isHot: true }, { links: { some: { interestLevel: 'HIGH', status: 'ACTIVE' } } }] }, take: 6, include: { _count: { select: { requirements: { where: { deletedAt: null } } } } } }),
    allMatchesForOwner(uid, 60),
  ]);
  const linked = new Set((await prisma.propertyClient.findMany({ where: { ownerId: uid, status: 'ACTIVE' }, select: { requirementId: true, propertyId: true } })).map((l) => `${l.requirementId}:${l.propertyId}`));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b || 0), 0);
  ok(res, {
    stats: { properties, clients, followUpsToday: todays.length, potentialDealValue: sum(openDeals.map((d) => d.dealValue)), potentialCommission: sum(openDeals.map((d) => d.expectedCommission)) },
    todaysFollowUps: todays, upcomingSiteVisits: siteVisits, hotClients,
    propertyMatches: matches.filter((m) => !linked.has(`${m.requirement.id}:${m.property.id}`)).slice(0, 6).map((m) => ({ score: m.score, requirement: { id: m.requirement.id, code: m.requirement.code, type: m.requirement.type, client: m.requirement.client }, property: { id: m.property.id, code: m.property.code, location: m.property.location, subtype: m.property.subtype, photo: m.property.photos[0]?.url ?? null } })),
    pipeline: STAGES.filter((s) => s !== 'CLOSED' && s !== 'LOST').map((s) => ({ stage: s, count: openDeals.filter((d) => d.stage === s).length, value: sum(openDeals.filter((d) => d.stage === s).map((d) => d.dealValue)) })),
    recentProperties: recentProperties.map((i) => ({ ...i, isShared: i.shares.length > 0, dealStatus: i.deals[0]?.stage ?? null, interestedClients: i._count.links })),
    recentActivity,
  });
});
pc.get('/analytics', async (req, res) => ok(res, await computeAnalytics({ ownerId: me(req) })));
pc.get('/search', async (req, res) => ok(res, await globalSearch(String(req.query.q || ''), me(req))));

/* ================= ACTIVITY / BIN / MASTER DATA ================= */
pc.get('/activity-logs', async (req, res) => {
  const p = paging(req.query, ['createdAt']);
  const where: any = { userId: me(req) };
  for (const k of ['entityType', 'entityId', 'requirementId', 'clientId', 'propertyId', 'dealId', 'action'] as const) if (str(req.query[k])) where[k] = req.query[k];
  const [total, items] = await Promise.all([prisma.activityLog.count({ where }), prisma.activityLog.findMany({ where, ...p })]);
  ok(res, items, pageMeta(total, p));
});
pc.get('/bin', async (req, res) => {
  const where: any = { ownerId: me(req), status: 'IN_BIN' };
  if (str(req.query.entityType)) where.entityType = req.query.entityType;
  ok(res, await prisma.binItem.findMany({ where, orderBy: { deletedAt: 'desc' }, select: { id: true, entityType: true, entityId: true, entityCode: true, label: true, reason: true, deletedAt: true, deletedByType: true, deletedById: true } }));
});
pc.post('/bin/:id/restore', async (req, res) => ok(res, await restoreFromBin(req.actor, req.params.id)));
pc.delete('/bin/:id', async (req, res) => ok(res, await purgeFromBin(req.actor, req.params.id)));
pc.get('/locations', async (req, res) => {
  const q = str(req.query.q);
  ok(res, await prisma.location.findMany({ where: { active: true, ...(q ? { OR: [{ area: ci(q) }, { locality: ci(q) }, { pincode: { contains: q } }] } : {}) }, orderBy: { area: 'asc' }, take: 50 }));
});
pc.get('/amenities', async (_req, res) => ok(res, await prisma.amenity.findMany({ where: { active: true }, orderBy: { name: 'asc' } })));
pc.get('/meta/stages', (_req, res) => ok(res, { stages: STAGES, probability: PROBABILITY }));
