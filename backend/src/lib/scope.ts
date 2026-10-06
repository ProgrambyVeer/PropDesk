import { prisma } from './prisma';
import { forbidden, notFound } from './http';
import type { Actor } from '../types';

type Model = 'client' | 'requirement' | 'property' | 'deal' | 'followUp' | 'propertyClient';
const LABEL: Record<Model, string> = {
  client: 'Client', requirement: 'Requirement', property: 'Property', deal: 'Deal', followUp: 'Follow-up', propertyClient: 'Link',
};

export const ownerWhere = (actor: Actor) => (actor.kind === 'pc' ? { ownerId: actor.userId } : {});

// Loads a record by database id (or human code) and enforces tenant isolation: 403 for other PCs' data.
export async function loadOwned<T = any>(
  model: Model, idOrCode: string, actor: Actor, opts: { includeDeleted?: boolean; include?: any } = {},
): Promise<T> {
  const delegate = (prisma as any)[model];
  const where = model === 'propertyClient' ? { id: idOrCode } : { OR: [{ id: idOrCode }, { code: idOrCode }] };
  const rec = await delegate.findFirst({ where, include: opts.include });
  if (!rec) throw notFound(LABEL[model]);
  if (actor.kind === 'pc' && rec.ownerId !== actor.userId) throw forbidden();
  if (!opts.includeDeleted && rec.deletedAt) throw notFound(LABEL[model]);
  return rec;
}

export async function canViewProperty(actor: Actor, property: { id: string; ownerId: string }) {
  if (actor.kind === 'admin' || property.ownerId === actor.userId) return 'OWNER' as const;
  const share = await prisma.propertyShare.findFirst({ where: { propertyId: property.id, receiverId: actor.userId, status: { not: 'REVOKED' } } });
  return share ? ('VIEW_ONLY' as const) : null;
}
