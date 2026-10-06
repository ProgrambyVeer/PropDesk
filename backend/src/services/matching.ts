import type { Property, PropertyTransaction, Requirement, RequirementType, TransactionKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSetting } from '../lib/settings';

export const TX_FOR: Record<RequirementType, TransactionKind> = {
  BUY_LOOKING: 'SALE', SELL_OFFERING: 'SALE', RENT_LOOKING: 'RENT', RENT_OFFERING: 'RENT', LEASE_LOOKING: 'LEASE', LEASE_OFFERING: 'LEASE',
};
export const isLooking = (t: RequirementType) => t.endsWith('_LOOKING');
export const txPrice = (t: PropertyTransaction) => (t.kind === 'SALE' ? t.salePrice : t.kind === 'RENT' ? t.rentAmount : t.leaseAmount);

type P = Property & { transactions: PropertyTransaction[] };
export interface MatchReason { factor: string; matched: boolean; partial?: boolean; detail: string }
export interface MatchResult { score: number; reasons: MatchReason[] }

const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= b * pct;
const norm = (s?: string | null) => (s || '').trim().toLowerCase();

export function scoreMatch(req: Requirement, prop: P): MatchResult | null {
  if (req.category !== prop.category) return null;
  const tx = prop.transactions.find((t) => t.kind === TX_FOR[req.type] && t.status === 'ACTIVE');
  if (!tx) return null;
  let earned = 0; let possible = 0;
  const reasons: MatchReason[] = [];
  const add = (factor: string, weight: number, fraction: number, detail: string) => {
    possible += weight; earned += weight * fraction;
    reasons.push({ factor, matched: fraction === 1, partial: fraction > 0 && fraction < 1, detail });
  };
  add('Property Type', 15, 1, prop.category);
  add('Transaction', 15, 1, tx.kind);
  if (req.subtype) add('Subtype', 10, norm(req.subtype) === norm(prop.subtype) ? 1 : 0, prop.subtype);
  if (req.subCategory && prop.subCategory) add('Commercial Type', 5, req.subCategory === prop.subCategory ? 1 : 0, prop.subCategory);
  const loc = norm(req.location); const ploc = norm(prop.location);
  const locFrac = loc === ploc ? 1 : (ploc.includes(loc) || loc.includes(ploc) || (req.locality && norm(req.locality) === norm(prop.locality))) ? 0.6 : 0;
  add('Location', 20, locFrac, prop.location);
  const price = txPrice(tx);
  if (req.amount && price) {
    let f = 0;
    if (isLooking(req.type)) {
      if (price <= req.amount && (!req.amountMin || price >= req.amountMin * 0.9)) f = 1;
      else if (price <= req.amount * 1.1) f = 0.5;
    } else f = near(price, req.amount, 0.1) ? 1 : near(price, req.amount, 0.25) ? 0.5 : 0;
    add('Budget', 20, f, String(price));
  }
  if (req.bhk && prop.bhk) add('BHK', 10, req.bhk === prop.bhk ? 1 : Math.abs(req.bhk - prop.bhk) === 1 ? 0.5 : 0, `${prop.bhk} BHK`);
  if (req.area && prop.area) add('Area', 5, near(prop.area, req.area, 0.2) ? 1 : near(prop.area, req.area, 0.35) ? 0.5 : 0, `${prop.area} sqft`);
  if (req.dimLength && req.dimWidth && prop.dimLength && prop.dimWidth) {
    const same = req.dimUnit === prop.dimUnit;
    const f = same && near(prop.dimLength, req.dimLength, 0.15) && near(prop.dimWidth, req.dimWidth, 0.15) ? 1 : 0;
    add('Dimensions', 5, f, `${prop.dimLength} × ${prop.dimWidth}`);
  }
  if (req.facing && prop.facing) add('Facing', 3, norm(req.facing) === norm(prop.facing) ? 1 : 0, prop.facing);
  if (req.availableDate && tx.availableDate) {
    const ok = tx.availableDate.getTime() <= req.availableDate.getTime() + 15 * 86400e3;
    add('Availability', 2, ok ? 1 : 0, tx.availableDate.toISOString().slice(0, 10));
  }
  return { score: Math.round((earned / possible) * 100), reasons };
}

export const matchInclude = { transactions: true, photos: { orderBy: { position: 'asc' as const }, take: 1 } };

export async function matchesForRequirement(req: Requirement, minScore?: number) {
  const min = minScore ?? (await getSetting<number>('matching.minScore'));
  const props = await prisma.property.findMany({
    where: { ownerId: req.ownerId, deletedAt: null, status: 'ACTIVE', category: req.category },
    include: { ...matchInclude, shares: { select: { id: true }, take: 1 } },
  });
  const links = await prisma.propertyClient.findMany({ where: { requirementId: req.id, status: 'ACTIVE' }, select: { propertyId: true, id: true } });
  const linked = new Map(links.map((l) => [l.propertyId, l.id]));
  return props
    .map((p) => ({ property: p, match: scoreMatch(req, p) }))
    .filter((x): x is { property: typeof props[number]; match: MatchResult } => !!x.match && x.match.score >= min)
    .sort((a, b) => b.match.score - a.match.score)
    .map(({ property, match }) => ({ ...match, property, linked: linked.has(property.id), linkId: linked.get(property.id) || null }));
}

// All requirement-property match pairs for an owner (used by dashboard / analytics).
export async function allMatchesForOwner(ownerId: string, minScore?: number) {
  const min = minScore ?? (await getSetting<number>('matching.minScore'));
  const [reqs, props] = await Promise.all([
    prisma.requirement.findMany({ where: { ownerId, deletedAt: null, status: 'ACTIVE', client: { deletedAt: null } }, include: { client: { select: { id: true, name: true, code: true } } } }),
    prisma.property.findMany({ where: { ownerId, deletedAt: null, status: 'ACTIVE' }, include: matchInclude }),
  ]);
  const out: { requirement: typeof reqs[number]; property: typeof props[number]; score: number }[] = [];
  for (const r of reqs) for (const p of props) {
    const m = scoreMatch(r, p);
    if (m && m.score >= min) out.push({ requirement: r, property: p, score: m.score });
  }
  return out.sort((a, b) => b.score - a.score);
}
