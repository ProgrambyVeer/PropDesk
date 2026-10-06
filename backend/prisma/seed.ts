/* Seed script: idempotent master data + demo data (demo data only when no PCs exist). Run: yarn db:seed */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/rbac';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import * as R from '../src/services/records';
import { createDeal, changeStage, createLink } from '../src/services/deals';
import { nextCode } from '../src/lib/codes';
import type { Actor } from '../src/types';

const prisma = new PrismaClient();
const LOCATIONS: [string, string][] = [
  ['Whitefield', '560066'], ['Varthur', '560087'], ['Sarjapur', '562125'], ['Marathahalli', '560037'], ['HSR Layout', '560102'], ['Koramangala', '560034'],
  ['Indiranagar', '560038'], ['Bellandur', '560103'], ['Electronic City', '560100'], ['Hebbal', '560024'], ['Yelahanka', '560064'], ['JP Nagar', '560078'],
  ['Jayanagar', '560041'], ['Banashankari', '560050'], ['Devanahalli', '562110'], ['BTM Layout', '560076'], ['Hennur', '560043'], ['Kanakapura Road', '560062'],
];
const AMENITIES = ['Swimming Pool', 'Gym', 'Clubhouse', 'Security', 'Power Backup', 'Parking', 'Lift', "Children's Play Area", 'Garden', 'CCTV'];
const PROVIDERS = [
  { kind: 'OTP', provider: 'mock', secretEnv: ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'] },
  { kind: 'SMS', provider: 'mock', secretEnv: ['MSG91_AUTH_KEY'] },
  { kind: 'WHATSAPP', provider: 'deeplink', secretEnv: ['WHATSAPP_BUSINESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] },
  { kind: 'EMAIL', provider: 'mock', secretEnv: ['SMTP_URL'] },
  { kind: 'PUSH', provider: 'mock', secretEnv: [] },
  { kind: 'STORAGE', provider: 'local', secretEnv: ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] },
];
const PHOTOS = [
  'https://images.unsplash.com/photo-1600555179901-107bf80d25cf?w=1200&q=80', 'https://images.unsplash.com/photo-1708067077797-74f83eaa8231?w=1200&q=80',
  'https://images.unsplash.com/photo-1719416177005-f85fae63ac15?w=1200&q=80', 'https://images.unsplash.com/photo-1564078516393-cf04bd966897?w=1200&q=80',
  'https://images.unsplash.com/photo-1704040686413-2c607dbd2f06?w=1200&q=80', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80',
];
const day = 86400e3;
const at = (days: number, hour = 11) => { const d = new Date(Date.now() + days * day); d.setHours(hour, 0, 0, 0); return d; };

async function master() {
  for (const [key, description] of Object.entries(PERMISSIONS)) await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) for (const p of perms) {
    await prisma.rolePermission.upsert({ where: { role_permissionKey: { role: role as any, permissionKey: p } }, create: { role: role as any, permissionKey: p }, update: {} });
  }
  for (const [area, pincode] of LOCATIONS) await prisma.location.upsert({ where: { city_area_locality: { city: 'Bengaluru', area, locality: '' } }, create: { city: 'Bengaluru', area, pincode }, update: {} });
  for (const name of AMENITIES) await prisma.amenity.upsert({ where: { name }, create: { name }, update: {} });
  for (const p of PROVIDERS) await prisma.providerConfig.upsert({ where: { kind: p.kind }, create: p, update: { secretEnv: p.secretEnv } });
  for (const [key, d] of Object.entries(DEFAULT_SETTINGS)) await prisma.systemSetting.upsert({ where: { key }, create: { key, category: d.category, value: d.value as any }, update: {} });
  const pw = process.env.SEED_ADMIN_PASSWORD;
  if (!pw || !process.env.SEED_ADMIN_EMAIL) throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  const hash = await bcrypt.hash(pw, 12);
  const admins = [
    { email: process.env.SEED_ADMIN_EMAIL.toLowerCase(), name: 'Platform Owner', role: 'SUPER_ADMIN' },
    { email: 'ops.admin@propcrm.local', name: 'Operations Admin', role: 'ADMIN' },
    { email: 'support@propcrm.local', name: 'Support Desk', role: 'SUPPORT_ADMIN' },
    { email: 'viewer@propcrm.local', name: 'Read Only Auditor', role: 'READ_ONLY_ADMIN' },
  ];
  for (const a of admins) await prisma.adminUser.upsert({ where: { email: a.email }, create: { ...a, role: a.role as any, passwordHash: hash }, update: { passwordHash: hash, role: a.role as any, status: 'ACTIVE', failedAttempts: 0, lockedUntil: null } });
}

async function makePc(phone: string, name: string, company: string, rera: string, areas: string[]) {
  return prisma.user.create({ data: { phone, name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, pcCode: await nextCode('PC'), onboarded: true, lastLoginAt: new Date(), profile: { create: { companyName: company, reraNumber: rera, officeAddress: `${areas[0]}, Bengaluru`, whatsappNumber: phone, areasOfOperation: areas } } } });
}

type PropSeed = [string, string, string | null, string, number | null, [number, number], { kind: 'SALE' | 'RENT' | 'LEASE'; price: number; deposit?: number; period?: number }[], string?];
const PROPS: PropSeed[] = [
  ['RESIDENTIAL', 'Apartment', null, 'Whitefield', 3, [40, 45], [{ kind: 'SALE', price: 14500000 }], 'East'],
  ['RESIDENTIAL', 'Apartment', null, 'Varthur', 2, [30, 40], [{ kind: 'RENT', price: 42000, deposit: 200000 }], 'North'],
  ['COMMERCIAL', 'Shop', 'Full Commercial', 'HSR Layout', null, [25, 40], [{ kind: 'LEASE', price: 7800000, deposit: 1500000, period: 60 }, { kind: 'RENT', price: 95000, deposit: 600000 }], 'East'],
  ['RESIDENTIAL', 'Independent', null, 'Koramangala', 4, [40, 60], [{ kind: 'SALE', price: 52000000 }], 'North'],
  ['RESIDENTIAL', 'Standalone', null, 'Indiranagar', 3, [30, 50], [{ kind: 'SALE', price: 38000000 }, { kind: 'RENT', price: 120000, deposit: 600000 }], 'West'],
  ['LAND', 'Farmhouse', null, 'Devanahalli', null, [120, 200], [{ kind: 'SALE', price: 28000000 }], 'East'],
  ['LAND', 'Residential', null, 'Sarjapur', null, [30, 40], [{ kind: 'SALE', price: 8500000 }], 'North'],
  ['RESIDENTIAL', 'Apartment', null, 'Bellandur', 2, [28, 38], [{ kind: 'SALE', price: 9200000 }, { kind: 'RENT', price: 38000, deposit: 150000 }], 'East'],
  ['COMMERCIAL', 'Storehouse', 'Full Commercial', 'Electronic City', null, [80, 100], [{ kind: 'LEASE', price: 12000000, deposit: 2400000, period: 36 }], 'South'],
  ['RESIDENTIAL', 'Apartment', null, 'Hebbal', 3, [38, 42], [{ kind: 'SALE', price: 16800000 }], 'North'],
  ['RESIDENTIAL', 'Apartment', null, 'Marathahalli', 1, [22, 30], [{ kind: 'RENT', price: 24000, deposit: 100000 }], 'East'],
  ['COMMERCIAL', 'Store', 'Semi Commercial', 'Jayanagar', null, [20, 50], [{ kind: 'RENT', price: 150000, deposit: 1000000 }], 'West'],
  ['LAND', 'Agricultural', null, 'Yelahanka', null, [200, 300], [{ kind: 'SALE', price: 45000000 }], 'North'],
  ['RESIDENTIAL', 'Independent', null, 'JP Nagar', 3, [30, 40], [{ kind: 'SALE', price: 21000000 }, { kind: 'LEASE', price: 2500000, deposit: 500000, period: 36 }], 'East'],
  ['RESIDENTIAL', 'Apartment', null, 'Whitefield', 3, [42, 44], [{ kind: 'RENT', price: 55000, deposit: 300000 }], 'East'],
  ['COMMERCIAL', 'Land', 'Full Commercial', 'Banashankari', null, [60, 80], [{ kind: 'SALE', price: 62000000 }], 'South'],
];

function propertyBody([category, subtype, subCategory, location, bhk, [l, w], txs, facing]: PropSeed, i: number) {
  return {
    title: `${bhk ? `${bhk} BHK ` : ''}${subtype} in ${location}`, category, subtype, subCategory, location, locality: `${location} Main Road`, facing,
    bhk, bathrooms: bhk ? Math.max(1, bhk - (i % 2)) : null, balcony: bhk ? 1 + (i % 2) : null, parking: bhk ? 'Covered' : null, floor: bhk ? 2 + (i % 8) : null, totalFloors: bhk ? 12 : null,
    furnishing: bhk ? ['Semi Furnished', 'Fully Furnished', 'Unfurnished'][i % 3] : null, propertyAge: bhk ? ['New', '1-5 years', '5-10 years'][i % 3] : null,
    builtUpArea: bhk ? bhk * 550 + 150 : null, carpetArea: bhk ? bhk * 450 + 100 : null, amenities: bhk ? AMENITIES.slice(i % 4, (i % 4) + 5) : [],
    khata: category === 'LAND' ? (i % 2 ? 'A Khata' : 'E Khata') : null, dimLength: l, dimWidth: w, dimUnit: 'FEET',
    otherFeatures: 'Close to metro and IT parks', transactions: txs.map((t) => ({
      kind: t.kind, salePrice: t.kind === 'SALE' ? t.price : null, rentAmount: t.kind === 'RENT' ? t.price : null, leaseAmount: t.kind === 'LEASE' ? t.price : null,
      depositAmount: t.deposit ?? null, leasePeriodMonths: t.period ?? null, availableDate: t.kind === 'SALE' ? null : at(10 + i),
    })),
  };
}

async function demo() {
  if (await prisma.user.count()) return console.log('Demo data already present — skipping');
  const pcA = await makePc('9876543210', 'Arjun Rao', 'Rao Realty', 'PRM/KA/RERA/1251/309/AG/220517/002345', ['Whitefield', 'Varthur', 'HSR Layout', 'Sarjapur']);
  const pcB = await makePc('9123456780', 'Priya Nair', 'Nair Estates', 'PRM/KA/RERA/1251/446/AG/210909/001122', ['Hebbal', 'Yelahanka']);
  const A: Actor = { kind: 'pc', userId: pcA.id, name: pcA.name };
  const B: Actor = { kind: 'pc', userId: pcB.id, name: pcB.name };

  const props = [];
  for (const [i, p] of PROPS.entries()) {
    const prop = await R.createProperty(A, pcA.id, propertyBody(p, i));
    await prisma.propertyPhoto.create({ data: { propertyId: prop.id, url: PHOTOS[i % PHOTOS.length], storageKey: 'external', mimeType: 'image/jpeg', size: 0, position: 0 } });
    await prisma.property.update({ where: { id: prop.id }, data: { createdAt: new Date(Date.now() - (i % 6) * 30 * day - i * day) } });
    props.push(prop);
  }
  const bProps = [];
  for (const [i, p] of PROPS.slice(9, 12).entries()) bProps.push(await R.createProperty(B, pcB.id, propertyBody(p, i)));

  const clientSeed: [string, string, string, string?][] = [
    ['Rahul Sharma', '9845012345', 'Whitefield', 'rahul.sharma@gmail.com'], ['Ananya Rao', '9845023456', 'Koramangala'], ['Vikram Patel', '9845034567', 'HSR Layout', 'vikram.p@gmail.com'],
    ['Sneha Iyer', '9845045678', 'Bellandur'], ['Karthik Reddy', '9845056789', 'Indiranagar'], ['Meera Krishnan', '9845067890', 'JP Nagar'], ['Arvind Gupta', '9845078901', 'Hebbal'],
    ['Divya Menon', '9845089012', 'Sarjapur'], ['Rohan Desai', '9845090123', 'Electronic City'], ['Lakshmi Narayan', '9845101234', 'Jayanagar'], ['Suresh Kumar', '9845112345', 'Devanahalli'],
    ['Pooja Hegde', '9845123456', 'Marathahalli'], ['Naveen Shetty', '9845134567', 'Yelahanka'], ['Fatima Khan', '9845145678', 'Banashankari'], ['Aditya Joshi', '9845156789', 'Varthur'],
  ];
  const clients = [];
  for (const [i, [name, phone, location, email]] of clientSeed.entries()) {
    const c = await R.createClient(A, pcA.id, { name, phone, location, email, isHot: i < 4 });
    await prisma.client.update({ where: { id: c.id }, data: { createdAt: new Date(Date.now() - (i % 6) * 28 * day) } });
    clients.push(c);
  }
  const bClient = await R.createClient(B, pcB.id, { name: 'Ramesh Babu', phone: '9900112233', location: 'Hebbal' });
  await R.createRequirement(B, { clientId: bClient.id, type: 'BUY_LOOKING', category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Hebbal', bhk: 3, amount: 18000000, dimLength: 38, dimWidth: 42 });

  const res = (c: any, type: string, x: any) => R.createRequirement(A, { clientId: c.id, type, ...x });
  const rahul1 = await res(clients[0], 'BUY_LOOKING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Whitefield', bhk: 3, bathrooms: 2, amount: 15000000, dimLength: 40, dimWidth: 45, facing: 'East', furnishing: 'Semi Furnished' });
  const rahul2 = await res(clients[0], 'RENT_LOOKING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Varthur', bhk: 2, amount: 45000, deposit: 250000, availableDate: at(30), dimLength: 30, dimWidth: 40 });
  const rahul3 = await res(clients[0], 'LEASE_LOOKING', { category: 'COMMERCIAL', subCategory: 'Full Commercial', subtype: 'Shop', location: 'HSR Layout', amount: 8000000, deposit: 1500000, leasePeriodMonths: 60, availableDate: at(45) });
  const others = [
    await res(clients[1], 'BUY_LOOKING', { category: 'RESIDENTIAL', subtype: 'Independent', location: 'Koramangala', bhk: 4, amount: 55000000, dimLength: 40, dimWidth: 60 }),
    await res(clients[1], 'SELL_OFFERING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Bellandur', bhk: 2, amount: 9500000, dimLength: 28, dimWidth: 38 }),
    await res(clients[2], 'BUY_LOOKING', { category: 'LAND', subtype: 'Residential', location: 'Sarjapur', amount: 9000000, dimLength: 30, dimWidth: 40, khata: 'A Khata' }),
    await res(clients[3], 'RENT_LOOKING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Bellandur', bhk: 2, amount: 40000, availableDate: at(20), dimLength: 28, dimWidth: 38 }),
    await res(clients[4], 'BUY_LOOKING', { category: 'RESIDENTIAL', subtype: 'Standalone', location: 'Indiranagar', bhk: 3, amount: 40000000, dimLength: 30, dimWidth: 50 }),
    await res(clients[5], 'LEASE_LOOKING', { category: 'RESIDENTIAL', subtype: 'Independent', location: 'JP Nagar', bhk: 3, amount: 2600000, leasePeriodMonths: 36, dimLength: 30, dimWidth: 40 }),
    await res(clients[6], 'BUY_LOOKING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Hebbal', bhk: 3, amount: 17500000, dimLength: 38, dimWidth: 42 }),
    await res(clients[7], 'BUY_LOOKING', { category: 'LAND', subtype: 'Farmhouse', location: 'Devanahalli', amount: 30000000 }),
    await res(clients[8], 'LEASE_LOOKING', { category: 'COMMERCIAL', subCategory: 'Full Commercial', subtype: 'Storehouse', location: 'Electronic City', amount: 12500000, leasePeriodMonths: 36 }),
    await res(clients[9], 'RENT_LOOKING', { category: 'COMMERCIAL', subCategory: 'Semi Commercial', subtype: 'Store', location: 'Jayanagar', amount: 160000 }),
    await res(clients[11], 'RENT_LOOKING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Marathahalli', bhk: 1, amount: 25000, dimLength: 22, dimWidth: 30 }),
    await res(clients[12], 'BUY_LOOKING', { category: 'LAND', subtype: 'Agricultural', location: 'Yelahanka', amount: 46000000 }),
    await res(clients[13], 'BUY_LOOKING', { category: 'COMMERCIAL', subCategory: 'Full Commercial', subtype: 'Land', location: 'Banashankari', amount: 65000000 }),
    await res(clients[14], 'RENT_OFFERING', { category: 'RESIDENTIAL', subtype: 'Apartment', location: 'Varthur', bhk: 2, amount: 42000, deposit: 200000, availableDate: at(15), dimLength: 30, dimWidth: 40 }),
  ];

  const L = async (r: any, p: any, interestLevel = 'MEDIUM') => createLink(A, { clientId: r.clientId, requirementId: r.id, propertyId: p.id, interestLevel: interestLevel as any });
  await L(rahul1, props[0], 'HIGH'); await L(rahul2, props[1], 'MEDIUM'); await L(others[1], props[7]); await L(others[4], props[4], 'HIGH');

  const D = async (r: any, p: any, value: number, pct: number, stages: string[]) => {
    const d = await createDeal(A, { clientId: r.clientId, requirementId: r.id, propertyId: p.id, dealValue: value, commissionPercent: pct });
    for (const s of stages) {
      await changeStage(A, d.id, s === 'CLOSED' ? { stage: s, closingDate: at(-(5 + Math.floor(Math.random() * 100))), dealValue: value, note: 'Registered at sub-registrar office' } : s === 'LOST' ? { stage: s, lossReason: 'Client chose another property' } : { stage: s });
    }
    return d;
  };
  await D(rahul1, props[0], 14500000, 1, ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED']);
  await D(rahul2, props[1], 42000, 100, ['CONTACTED']);
  await D(others[0], props[3], 51000000, 1, ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION']);
  await D(others[4], props[4], 37500000, 1, ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED']);
  await D(others[2], props[6], 8500000, 2, ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED']);
  await D(others[3], props[7], 38000, 100, ['CONTACTED', 'LOST']);
  await D(others[8], props[8], 12000000, 1.5, ['CONTACTED', 'INTERESTED', 'NEGOTIATION', 'DOCUMENTATION']);
  await D(others[6], props[9], 16800000, 1, ['CONTACTED', 'INTERESTED']);
  await D(others[10], props[10], 24000, 100, ['CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED']);
  await D(rahul3, props[2], 7800000, 2, []);

  const F = (c: any, r: any, p: any, type: string, when: Date, notes: string) => R.createFollowUp(A, { clientId: c.id, requirementId: r?.id, propertyId: p?.id, type, scheduledAt: when, notes });
  const inHours = (h: number) => new Date(Date.now() + h * 3600e3);
  await F(clients[0], rahul1, props[0], 'SITE_VISIT', inHours(3), 'Show 3BHK at Whitefield, meet at gate 2');
  await F(clients[0], rahul2, props[1], 'CALL', inHours(1), 'Confirm rental budget and move-in date');
  await F(clients[1], others[0], props[3], 'MEETING', inHours(5), 'Negotiation meeting with owner');
  await F(clients[3], others[3], null, 'WHATSAPP', inHours(26), 'Send 3 rental options in Bellandur');
  await F(clients[6], others[6], props[9], 'SITE_VISIT', inHours(50), 'Hebbal apartment site visit');
  const done = await F(clients[4], others[4], props[4], 'CALL', inHours(-48), 'Discuss documentation');
  await R.setFollowUpStatus(A, done.id, 'COMPLETED', { outcome: 'Documents collected' });
  await F(clients[8], others[8], props[8], 'CALL', inHours(-30), 'Lease terms discussion');

  await prisma.propertyShare.create({ data: { propertyId: props[5].id, senderId: pcA.id, targetType: 'PC', receiverId: pcB.id, receiverPhone: pcB.phone } });
  await prisma.notification.create({ data: { code: await nextCode('NTF'), recipientId: pcB.id, type: 'PROPERTY_SHARED', title: `Arjun Rao shared ${props[5].code}`, body: 'Farmhouse · Devanahalli (view only)', propertyId: props[5].id, status: 'DELIVERED', deliveredAt: new Date() } });
  console.log(`Seeded PCs ${pcA.phone}, ${pcB.phone}; ${props.length + bProps.length} properties; ${clients.length + 1} clients`);
}

master().then(demo).then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
