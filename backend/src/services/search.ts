import { prisma } from '../lib/prisma';
import { ci } from '../lib/http';

// Parses "1.5 cr", "85L", "45000", "45k" into rupees.
export function parsePrice(q: string): number | null {
  const m = q.toLowerCase().replace(/[₹,\s]/g, '').match(/^(\d+(?:\.\d+)?)(cr|crore|l|lac|lakh|lakhs|k)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2]?.startsWith('c') ? 1e7 : m[2]?.startsWith('l') ? 1e5 : m[2] === 'k' ? 1e3 : 1;
  return n * mult;
}

export async function globalSearch(qRaw: string, ownerId?: string, limit = 8) {
  const q = qRaw.trim();
  if (q.length < 2) return { clients: [], requirements: [], properties: [], deals: [], followUps: [], pcs: [] };
  const own = ownerId ? { ownerId } : {};
  const bhk = q.match(/^(\d)\s*bhk$/i);
  const price = !bhk && /\d/.test(q) && !/^\d{5,}$/.test(q) || /(cr|l|lakh|k)$/i.test(q) ? parsePrice(q) : null;
  const priceOr = price ? [{ transactions: { some: { OR: [{ salePrice: { gte: price * 0.9, lte: price * 1.1 } }, { rentAmount: { gte: price * 0.9, lte: price * 1.1 } }, { leaseAmount: { gte: price * 0.9, lte: price * 1.1 } }] } } }] : [];
  const stage = q.toUpperCase().replace(/\s+/g, '_');
  const stageMatch = ['NEW', 'CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED', 'LOST'].filter((s) => s.startsWith(stage));
  const owner = { owner: { select: { id: true, name: true, pcCode: true } } };
  const [clients, requirements, properties, deals, followUps, pcs] = await Promise.all([
    prisma.client.findMany({ where: { ...own, deletedAt: null, OR: [{ name: ci(q) }, { phone: { contains: q.replace(/\D/g, '') || q } }, { code: ci(q) }, { location: ci(q) }, { email: ci(q) }] }, take: limit, include: owner }),
    prisma.requirement.findMany({
      where: { ...own, deletedAt: null, client: { deletedAt: null }, OR: [{ code: ci(q) }, { location: ci(q) }, { locality: ci(q) }, { subtype: ci(q) }, { client: { name: ci(q) } }, ...(bhk ? [{ bhk: Number(bhk[1]) }] : []), ...(price ? [{ amount: { gte: price * 0.9, lte: price * 1.1 } }] : [])] },
      take: limit, include: { client: { select: { name: true, id: true } }, ...owner },
    }),
    prisma.property.findMany({
      where: { ...own, deletedAt: null, OR: [{ code: ci(q) }, { location: ci(q) }, { locality: ci(q) }, { title: ci(q) }, { subtype: ci(q) }, ...(bhk ? [{ bhk: Number(bhk[1]) }] : []), ...priceOr, ...(/^\d+$/.test(q) && Number(q) < 100000 ? [{ area: Number(q) }] : [])] },
      take: limit, include: { transactions: true, photos: { take: 1, orderBy: { position: 'asc' } }, ...owner },
    }),
    prisma.deal.findMany({
      where: { ...own, deletedAt: null, OR: [{ code: ci(q) }, { client: { name: ci(q) } }, { property: { code: ci(q) } }, { requirement: { code: ci(q) } }, ...(stageMatch.length ? [{ stage: { in: stageMatch as any } }] : [])] },
      take: limit, include: { client: { select: { name: true } }, property: { select: { code: true, location: true } }, requirement: { select: { code: true } }, ...owner },
    }),
    prisma.followUp.findMany({
      where: { ...own, deletedAt: null, OR: [{ code: ci(q) }, { notes: ci(q) }, { client: { name: ci(q) } }, { requirement: { code: ci(q) } }] },
      take: limit, include: { client: { select: { name: true } }, requirement: { select: { code: true } }, ...owner },
    }),
    ownerId ? Promise.resolve([]) : prisma.user.findMany({ where: { OR: [{ name: ci(q) }, { phone: { contains: q } }, { email: ci(q) }, { pcCode: ci(q) }, { profile: { companyName: ci(q) } }] }, take: limit, include: { profile: true } }),
  ]);
  return { clients, requirements, properties, deals, followUps, pcs };
}
