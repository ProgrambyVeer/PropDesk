import 'dotenv/config';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { runSchedulerTick } from '../src/services/notifications';

const app = createApp();
const api = () => request(app);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function pcLogin(phone: string) {
  await api().post('/api/v1/auth/send-otp').send({ phone }).expect(200);
  const r = await api().post('/api/v1/auth/verify-otp').send({ phone, code: process.env.MOCK_OTP_CODE || '123456' }).expect(200);
  return { token: r.body.data.token as string, user: r.body.data.user };
}
const as = (t: string) => ({ get: (u: string) => api().get(u).set('Authorization', `Bearer ${t}`), post: (u: string, b: any = {}) => api().post(u).set('Authorization', `Bearer ${t}`).send(b), patch: (u: string, b: any) => api().patch(u).set('Authorization', `Bearer ${t}`).send(b), del: (u: string) => api().delete(u).set('Authorization', `Bearer ${t}`) });
const RES = (clientId: string, x: any = {}) => ({ clientId, type: 'BUY_LOOKING', category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Whitefield', bhk: 3, amount: 15000000, dimLength: 40, dimWidth: 45, ...x });
const PROP = { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Whitefield', bhk: 3, builtUpArea: 1800, dimLength: 40, dimWidth: 45, facing: 'East', transactions: [{ kind: 'SALE', salePrice: 14500000 }, { kind: 'RENT', rentAmount: 55000, depositAmount: 300000, availableDate: '2030-01-01' }] };

let TA = ''; let A: ReturnType<typeof as>; let B: ReturnType<typeof as>; let ADMIN: ReturnType<typeof as>;
let clientA: any; let clientB: any; let reqs: any[] = []; let propA: any; let userB: any;

beforeAll(async () => {
  TA = (await pcLogin('9000000001')).token; A = as(TA);
  const b = await pcLogin('9000000002'); B = as(b.token); userB = b.user;
  await prisma.adminUser.create({ data: { email: 'root@test.local', name: 'Root', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash('RootPass123!', 4) } });
  await prisma.adminUser.create({ data: { email: 'ro@test.local', name: 'RO', role: 'READ_ONLY_ADMIN', passwordHash: await bcrypt.hash('RootPass123!', 4) } });
  const r = await api().post('/api/v1/admin/auth/login').send({ email: 'root@test.local', password: 'RootPass123!' }).expect(200);
  ADMIN = as(r.body.data.token);
});

describe('Mandatory requirement isolation test', () => {
  it('creates client A with REQ-000001..3, edits/deletes/restores only REQ-000002, next ID is new', async () => {
    clientA = (await A.post('/api/v1/clients', { name: 'Rahul Sharma', phone: '9845012345', location: 'Whitefield' }).expect(201)).body.data;
    for (const x of [{}, { type: 'RENT_LOOKING', location: 'Varthur', bhk: 2, amount: 45000 }, { type: 'LEASE_LOOKING', category: 'COMMERCIAL', subCategory: 'Full Commercial', subtype: 'Shop', location: 'HSR Layout', amount: 8000000, leasePeriodMonths: 60, bhk: null, code: 'REQ-999999' }]) {
      reqs.push((await A.post('/api/v1/requirements', RES(clientA.id, x)).expect(201)).body.data);
    }
    expect(reqs.map((r) => r.code)).toEqual(['REQ-000001', 'REQ-000002', 'REQ-000003']);
    const snap = async () => Promise.all(reqs.map(async (r) => (await A.get(`/api/v1/requirements/${r.id}`).expect(200)).body.data));
    const before = await snap();
    await A.patch(`/api/v1/requirements/${reqs[1].id}`, { amount: 50000, bhk: 3 }).expect(200);
    const after = await snap();
    expect(after[0].updatedAt).toBe(before[0].updatedAt); expect(after[0].amount).toBe(15000000);
    expect(after[1].amount).toBe(50000); expect(after[1].code).toBe('REQ-000002');
    expect(after[2].updatedAt).toBe(before[2].updatedAt);
    await A.del(`/api/v1/requirements/${reqs[1].id}`).expect(200);
    const list = (await A.get(`/api/v1/requirements?clientId=${clientA.id}`).expect(200)).body.data.map((r: any) => r.code);
    expect(list.sort()).toEqual(['REQ-000001', 'REQ-000003']);
    const bin = (await A.get('/api/v1/bin').expect(200)).body.data;
    const item = bin.find((b: any) => b.entityCode === 'REQ-000002');
    expect(item).toBeTruthy();
    const restored = (await A.post(`/api/v1/bin/${item.id}/restore`).expect(200)).body.data;
    expect(restored.code).toBe('REQ-000002'); expect(restored.id).toBe(reqs[1].id);
    const next = (await A.post('/api/v1/requirements', RES(clientA.id)).expect(201)).body.data;
    expect(next.code).toBe('REQ-000004');
  });
  it('permanently deleted requirement IDs are never reused', async () => {
    const r = (await A.post('/api/v1/requirements', RES(clientA.id)).expect(201)).body.data;
    await A.del(`/api/v1/requirements/${r.id}`).expect(200);
    const item = (await A.get('/api/v1/bin').expect(200)).body.data.find((b: any) => b.entityCode === r.code);
    await A.del(`/api/v1/bin/${item.id}`).expect(200);
    const n = (await A.post('/api/v1/requirements', RES(clientA.id)).expect(201)).body.data;
    expect(Number(n.code.slice(4))).toBeGreaterThan(Number(r.code.slice(4)));
  });
});

describe('Validation', () => {
  it('rejects bad phone, missing dimensions and irrelevant subtypes', async () => {
    await A.post('/api/v1/clients', { name: 'X', phone: '123', location: 'HSR' }).expect(422);
    await A.post('/api/v1/requirements', RES(clientA.id, { dimLength: null })).expect(422);
    await A.post('/api/v1/requirements', RES(clientA.id, { subtype: 'Shop' })).expect(422);
    const bad = await A.post('/api/v1/properties', { ...PROP, transactions: [{ kind: 'RENT', rentAmount: 1 }] }).expect(422);
    expect(bad.body.error.details.fieldErrors['RENT.availableDate']).toBeTruthy();
  });
});

describe('Properties, photos, matching, linking, deals', () => {
  it('creates a multi-transaction property and strips irrelevant fields', async () => {
    propA = (await A.post('/api/v1/properties', { ...PROP, khata: 'A Khata' }).expect(201)).body.data;
    expect(propA.code).toMatch(/^PROP-\d{6}$/); expect(propA.transactions).toHaveLength(2); expect(propA.khata).toBeNull();
    expect(propA.transactions.find((t: any) => t.kind === 'SALE').depositAmount).toBeNull();
  });
  it('persists, reorders and deletes photos', async () => {
    const up = await api().post(`/api/v1/properties/${propA.id}/photos`).set('Authorization', `Bearer ${TA}`).attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    await api().post(`/api/v1/properties/${propA.id}/photos`).set('Authorization', `Bearer ${TA}`).attach('photos', Buffer.from('not-an-image-file'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    const p = (await A.get(`/api/v1/properties/${propA.id}`).expect(200)).body.data;
    expect(p.photos).toHaveLength(1);
    await api().get(p.photos[0].url).expect(200);
    await A.del(`/api/v1/property-photos/${p.photos[0].id}`).expect(200);
  });
  it('matches per requirement with reasons', async () => {
    const m = (await A.get(`/api/v1/requirements/${reqs[0].id}/matches`).expect(200)).body.data;
    expect(m[0].property.id).toBe(propA.id); expect(m[0].score).toBeGreaterThanOrEqual(80);
    expect(m[0].reasons.map((r: any) => r.factor)).toContain('Location');
    const m3 = (await A.get(`/api/v1/requirements/${reqs[2].id}/matches`).expect(200)).body.data;
    expect(m3.find((x: any) => x.property.id === propA.id)).toBeUndefined();
  });
  it('links to one requirement only and enforces buy/sell conflicts', async () => {
    await A.post('/api/v1/property-client-links', { clientId: clientA.id, requirementId: reqs[0].id, propertyId: propA.id }).expect(201);
    const l2 = (await A.get(`/api/v1/property-client-links?requirementId=${reqs[1].id}`).expect(200)).body.data;
    expect(l2).toHaveLength(0);
    const sell = (await A.post('/api/v1/requirements', RES(clientA.id, { type: 'SELL_OFFERING' })).expect(201)).body.data;
    await A.post('/api/v1/property-client-links', { clientId: clientA.id, requirementId: sell.id, propertyId: propA.id }).expect(409);
  });
  it('runs a deal through the pipeline with commission', async () => {
    const d = (await A.post('/api/v1/deals', { clientId: clientA.id, requirementId: reqs[0].id, propertyId: propA.id, dealValue: 15000000, commissionPercent: 1 }).expect(201)).body.data;
    expect(d.expectedCommission).toBe(150000); expect(d.requirementId).toBe(reqs[0].id);
    for (const s of ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'NEGOTIATION']) await A.post(`/api/v1/deals/${d.id}/stage`, { stage: s }).expect(200);
    await A.post(`/api/v1/deals/${d.id}/stage`, { stage: 'CLOSED' }).expect(422);
    const closed = (await A.post(`/api/v1/deals/${d.id}/stage`, { stage: 'CLOSED', closingDate: '2026-01-15' }).expect(200)).body.data;
    expect(closed.finalCommission).toBe(150000);
    const full = (await A.get(`/api/v1/deals/${d.id}`).expect(200)).body.data;
    expect(full.history.length).toBe(6);
    expect(full.timeline.some((t: any) => t.action === 'DEAL_CLOSED')).toBe(true);
  });
});

describe('Follow-ups & notifications', () => {
  it('reschedules and moves notification timing', async () => {
    const at = new Date(Date.now() + 2 * 3600e3);
    const fu = (await A.post('/api/v1/follow-ups', { clientId: clientA.id, requirementId: reqs[1].id, type: 'CALL', scheduledAt: at, reminderMinutes: 30 }).expect(201)).body.data;
    expect(fu.requirementId).toBe(reqs[1].id);
    const to = new Date(Date.now() + 26 * 3600e3);
    await A.post(`/api/v1/follow-ups/${fu.id}/reschedule`, { scheduledAt: to }).expect(200);
    const pend = await prisma.notification.findMany({ where: { followUpId: fu.id, status: 'PENDING' } });
    expect(pend.map((n) => n.scheduledFor.getTime()).sort()).toEqual([to.getTime() - 30 * 60e3, to.getTime()]);
    await prisma.notification.updateMany({ where: { followUpId: fu.id, status: 'PENDING', type: 'UPCOMING_FOLLOW_UP' }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await runSchedulerTick();
    const inbox = (await A.get('/api/v1/notifications').expect(200)).body.data;
    expect(inbox.some((n: any) => n.followUpId === fu.id && n.type === 'UPCOMING_FOLLOW_UP')).toBe(true);
    await A.post(`/api/v1/follow-ups/${fu.id}/complete`, { outcome: 'done' }).expect(200);
    expect(await prisma.notification.count({ where: { followUpId: fu.id, status: 'PENDING' } })).toBe(0);
  });
});

describe('Sharing', () => {
  it('shares in-app with a registered PC (view only) and falls back to WhatsApp', async () => {
    const r = (await A.post('/api/v1/property-shares', { propertyId: propA.id, targetType: 'PC', phone: userB.phone }).expect(201)).body.data;
    expect(r.registered).toBe(true); expect(r.share.permission).toBe('VIEW_ONLY');
    const seen = (await B.get(`/api/v1/properties/${propA.id}`).expect(200)).body.data;
    expect(seen.access).toBe('VIEW_ONLY'); expect(seen.isShared).toBe(true);
    await B.patch(`/api/v1/properties/${propA.id}`, { location: 'Hacked' }).expect(403);
    const un = (await A.post('/api/v1/property-shares', { propertyId: propA.id, targetType: 'CLIENT', phone: '9811111111' }).expect(201)).body.data;
    expect(un.registered).toBe(false); expect(un.message).toBe('Number not registered.'); expect(un.whatsappUrl).toContain('wa.me/919811111111');
    const list = (await A.get('/api/v1/properties').expect(200)).body.data;
    expect(list.find((p: any) => p.id === propA.id).isShared).toBe(true);
  });
});

describe('Tenant isolation & admin', () => {
  it('PC A cannot access PC B data (403); super admin can', async () => {
    clientB = (await B.post('/api/v1/clients', { name: 'Client B', phone: '9822222222', location: 'Hebbal' }).expect(201)).body.data;
    const reqB = (await B.post('/api/v1/requirements', RES(clientB.id)).expect(201)).body.data;
    const propB = (await B.post('/api/v1/properties', PROP).expect(201)).body.data;
    await A.get(`/api/v1/clients/${clientB.id}`).expect(403);
    await A.get(`/api/v1/requirements/${reqB.id}`).expect(403);
    await A.patch(`/api/v1/requirements/${reqB.id}`, { amount: 1 }).expect(403);
    await A.get(`/api/v1/properties/${propB.id}`).expect(403);
    await A.get(`/api/v1/requirements/${reqB.id}/matches`).expect(403);
    expect((await A.get('/api/v1/clients').expect(200)).body.data.some((c: any) => c.id === clientB.id)).toBe(false);
    await ADMIN.get(`/api/v1/admin/clients/${clientB.id}`).expect(200);
    await A.get('/api/v1/admin/dashboard').expect(401);
  });
  it('enforces admin RBAC and audits', async () => {
    const ro = await api().post('/api/v1/admin/auth/login').send({ email: 'ro@test.local', password: 'RootPass123!' }).expect(200);
    const RO = as(ro.body.data.token);
    await RO.get('/api/v1/admin/pcs').expect(200);
    await RO.post(`/api/v1/admin/pcs/${userB.id}/status`, { status: 'SUSPENDED', reason: 'x', confirm: true }).expect(403);
    await api().post('/api/v1/admin/auth/login').send({ email: 'root@test.local', password: 'wrong' }).expect(401);
    expect(await prisma.adminLoginAttempt.count({ where: { success: false } })).toBeGreaterThan(0);
    await expect(prisma.adminAuditLog.deleteMany({})).rejects.toThrow();
  });
  it('suspends and reactivates a PC', async () => {
    await ADMIN.post(`/api/v1/admin/pcs/${userB.id}/status`, { status: 'SUSPENDED', reason: 'KYC pending', confirm: true }).expect(200);
    await B.get('/api/v1/auth/me').expect(401);
    await api().post('/api/v1/auth/send-otp').send({ phone: userB.phone }).expect(403);
    await ADMIN.post(`/api/v1/admin/pcs/${userB.id}/status`, { status: 'ACTIVE', confirm: true }).expect(200);
    await pcLogin(userB.phone);
    const audit = (await ADMIN.get('/api/v1/admin/activity?kind=audit').expect(200)).body.data.map((a: any) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['PC_SUSPENDED', 'PC_ACTIVATED', 'ADMIN_LOGIN']));
  });
  it('admin edits requirement in isolation, purges with confirmation and exports CSV without secrets', async () => {
    await ADMIN.patch(`/api/v1/admin/requirements/${reqs[1].id}`, { amount: 47000 }).expect(200);
    expect((await A.get(`/api/v1/requirements/${reqs[0].id}`)).body.data.amount).toBe(15000000);
    await A.del(`/api/v1/clients/${clientA.id}`).expect(200);
    const bin = (await ADMIN.get('/api/v1/admin/bin').expect(200)).body.data.find((b: any) => b.entityType === 'CLIENT');
    await ADMIN.post(`/api/v1/admin/bin/${bin.id}/purge`, { confirmText: 'delete' }).expect(422);
    await ADMIN.post(`/api/v1/admin/bin/${bin.id}/restore`).expect(200);
    const csv = await ADMIN.get('/api/v1/admin/export/pcs').expect(200);
    expect(csv.text).toContain('pcCode'); expect(csv.text).not.toMatch(/password|otp|secret/i);
    await api().get('/api/v1/health').expect(200);
  });
});
