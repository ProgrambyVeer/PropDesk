import { prisma } from '../lib/prisma';
import { allMatchesForOwner, txPrice } from './matching';
import { PROBABILITY, STAGES } from './deals';

export interface AnalyticsFilter { ownerId?: string; from?: Date; to?: Date; location?: string; category?: string; kind?: string }

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
function lastMonths(n: number, end = new Date()) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(end.getFullYear(), end.getMonth() - i, 1)));
  return out;
}
const countBy = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = key(r); if (k) m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b || 0), 0);

export async function computeAnalytics(f: AnalyticsFilter) {
  const own = f.ownerId ? { ownerId: f.ownerId } : {};
  const created = f.from || f.to ? { createdAt: { gte: f.from, lte: f.to } } : {};
  const propWhere: any = { ...own, ...created, deletedAt: null };
  if (f.location) propWhere.location = { contains: f.location, mode: 'insensitive' };
  if (f.category) propWhere.category = f.category;
  if (f.kind) propWhere.transactions = { some: { kind: f.kind } };
  const [properties, clients, requirements, deals, followUps] = await Promise.all([
    prisma.property.findMany({ where: propWhere, select: { id: true, category: true, subtype: true, location: true, status: true, createdAt: true, transactions: { select: { kind: true } } } }),
    prisma.client.findMany({ where: { ...own, ...created, deletedAt: null }, select: { id: true, createdAt: true, location: true } }),
    prisma.requirement.findMany({ where: { ...own, ...created, deletedAt: null, client: { deletedAt: null }, ...(f.category ? { category: f.category as any } : {}) }, select: { type: true, status: true, category: true, createdAt: true } }),
    prisma.deal.findMany({ where: { ...own, ...created, deletedAt: null, ...(f.category || f.location || f.kind ? { property: propWhere } : {}) }, select: { stage: true, dealValue: true, expectedCommission: true, finalCommission: true, createdAt: true, closingDate: true } }),
    prisma.followUp.findMany({ where: { ...own, ...(f.from || f.to ? { scheduledAt: { gte: f.from, lte: f.to } } : {}), deletedAt: null }, select: { type: true, status: true, scheduledAt: true } }),
  ]);
  const months = lastMonths(6, f.to);
  const closed = deals.filter((d) => d.stage === 'CLOSED');
  const open = deals.filter((d) => d.stage !== 'CLOSED' && d.stage !== 'LOST');
  const matches = f.ownerId ? (await allMatchesForOwner(f.ownerId)).length : undefined;
  const since30 = new Date(Date.now() - 30 * 86400e3);
  return {
    totals: {
      totalProperties: properties.length,
      activeProperties: properties.filter((p) => p.status === 'ACTIVE').length,
      sold: properties.filter((p) => p.status === 'SOLD').length,
      rented: properties.filter((p) => p.status === 'RENTED').length,
      leased: properties.filter((p) => p.status === 'LEASED').length,
      totalClients: clients.length,
      newClients: clients.filter((c) => c.createdAt >= since30).length,
      totalRequirements: requirements.length,
      activeRequirements: requirements.filter((r) => r.status === 'ACTIVE').length,
      matches,
      siteVisits: followUps.filter((x) => x.type === 'SITE_VISIT').length,
      deals: deals.length,
      activeDeals: open.length,
      closedDeals: closed.length,
      dealValue: sum(deals.filter((d) => d.stage !== 'LOST').map((d) => d.dealValue)),
      closedDealValue: sum(closed.map((d) => d.dealValue)),
      expectedCommission: sum(open.map((d) => d.expectedCommission)),
      earnedCommission: sum(closed.map((d) => d.finalCommission)),
    },
    monthlyDeals: months.map((m) => ({ month: m, created: deals.filter((d) => monthKey(d.createdAt) === m).length, closed: closed.filter((d) => d.closingDate && monthKey(d.closingDate) === m).length })),
    monthlyCommission: months.map((m) => ({ month: m, earned: sum(closed.filter((d) => d.closingDate && monthKey(d.closingDate) === m).map((d) => d.finalCommission)), expected: sum(open.filter((d) => monthKey(d.createdAt) === m).map((d) => d.expectedCommission)) })),
    propertyDistribution: countBy(properties, (p) => p.category),
    transactionDistribution: countBy(properties.flatMap((p) => p.transactions), (t) => t.kind),
    clientDistribution: countBy(requirements, (r) => r.type),
    requirementDistribution: countBy(requirements, (r) => r.category),
    dealFunnel: STAGES.map((s) => ({ stage: s, count: deals.filter((d) => d.stage === s).length })),
    locations: countBy(properties, (p) => p.location).slice(0, 10),
    propertyTypes: countBy(properties, (p) => p.subtype),
    followUpCompletion: countBy(followUps, (x) => x.status),
    growth: months.map((m) => ({
      month: m,
      properties: properties.filter((p) => monthKey(p.createdAt) === m).length,
      clients: clients.filter((c) => monthKey(c.createdAt) === m).length,
      requirements: requirements.filter((r) => monthKey(r.createdAt) === m).length,
      deals: deals.filter((d) => monthKey(d.createdAt) === m).length,
      commission: sum(closed.filter((d) => d.closingDate && monthKey(d.closingDate) === m).map((d) => d.finalCommission)),
    })),
  };
}

export async function propertyAnalytics(propertyId: string) {
  const p = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, include: { transactions: true } });
  const [links, followUps, shares, deals, timeline, matches] = await Promise.all([
    prisma.propertyClient.findMany({ where: { propertyId, status: 'ACTIVE' } }),
    prisma.followUp.findMany({ where: { propertyId, deletedAt: null } }),
    prisma.propertyShare.findMany({ where: { propertyId } }),
    prisma.deal.findMany({ where: { propertyId, deletedAt: null }, orderBy: { updatedAt: 'desc' } }),
    prisma.activityLog.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    allMatchesForOwner(p.ownerId),
  ]);
  const best = deals.filter((d) => d.stage !== 'LOST').sort((a, b) => PROBABILITY[b.stage] - PROBABILITY[a.stage])[0];
  return {
    daysListed: Math.floor((Date.now() - p.createdAt.getTime()) / 86400e3),
    matchedClients: new Set(matches.filter((m) => m.property.id === p.id).map((m) => m.requirement.clientId)).size,
    linkedClients: new Set(links.map((l) => l.clientId)).size,
    contacts: followUps.filter((f) => f.type === 'CALL' || f.type === 'WHATSAPP').length,
    siteVisits: followUps.filter((f) => f.type === 'SITE_VISIT').length,
    followUps: followUps.length,
    shares: shares.length,
    pcsSharedWith: new Set(shares.filter((s) => s.targetType === 'PC' && s.receiverId).map((s) => s.receiverId)).size,
    dealStage: best?.stage ?? null,
    dealProbability: best ? PROBABILITY[best.stage] : 0,
    dealValue: best?.dealValue ?? null,
    expectedCommission: sum(deals.filter((d) => d.stage !== 'LOST' && d.stage !== 'CLOSED').map((d) => d.expectedCommission)),
    finalCommission: sum(deals.filter((d) => d.stage === 'CLOSED').map((d) => d.finalCommission)),
    askingPrice: p.transactions.map((t) => ({ kind: t.kind, price: txPrice(t) })),
    timeline,
  };
}

export async function clientAnalytics(clientId: string, ownerId: string) {
  const [reqs, links, followUps, deals, timeline, matches] = await Promise.all([
    prisma.requirement.findMany({ where: { clientId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.propertyClient.findMany({ where: { clientId, status: 'ACTIVE' } }),
    prisma.followUp.findMany({ where: { clientId, deletedAt: null } }),
    prisma.deal.findMany({ where: { clientId, deletedAt: null } }),
    prisma.activityLog.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    allMatchesForOwner(ownerId),
  ]);
  const open = deals.filter((d) => d.stage !== 'CLOSED' && d.stage !== 'LOST');
  return {
    totalRequirements: reqs.length,
    activeRequirements: reqs.filter((r) => r.status === 'ACTIVE').length,
    matchedProperties: new Set(matches.filter((m) => m.requirement.clientId === clientId).map((m) => m.property.id)).size,
    linkedProperties: new Set(links.map((l) => l.propertyId)).size,
    siteVisits: followUps.filter((f) => f.type === 'SITE_VISIT').length,
    followUps: followUps.length,
    activeDeals: open.length,
    closedDeals: deals.filter((d) => d.stage === 'CLOSED').length,
    dealValue: sum(deals.filter((d) => d.stage !== 'LOST').map((d) => d.dealValue)),
    potentialCommission: sum(open.map((d) => d.expectedCommission)),
    byRequirement: reqs.map((r) => ({
      id: r.id, code: r.code, type: r.type, status: r.status,
      matches: matches.filter((m) => m.requirement.id === r.id).length,
      links: links.filter((l) => l.requirementId === r.id).length,
      followUps: followUps.filter((f) => f.requirementId === r.id).length,
      deals: deals.filter((d) => d.requirementId === r.id).length,
      dealValue: sum(deals.filter((d) => d.requirementId === r.id && d.stage !== 'LOST').map((d) => d.dealValue)),
    })),
    timeline,
  };
}
