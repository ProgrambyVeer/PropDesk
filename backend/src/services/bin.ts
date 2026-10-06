import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/http';
import { logActivity } from '../lib/activity';
import type { Actor } from '../types';

export type BinEntity = 'CLIENT' | 'REQUIREMENT' | 'PROPERTY' | 'DEAL';
const MODEL: Record<BinEntity, 'client' | 'requirement' | 'property' | 'deal'> = { CLIENT: 'client', REQUIREMENT: 'requirement', PROPERTY: 'property', DEAL: 'deal' };

function labelOf(type: BinEntity, rec: any) {
  if (type === 'CLIENT') return `${rec.name} (${rec.phone})`;
  if (type === 'REQUIREMENT') return `${rec.code} · ${rec.type.replace('_', ' ')} · ${rec.location}`;
  if (type === 'PROPERTY') return `${rec.code} · ${rec.subtype} · ${rec.location}`;
  return `${rec.code} · ${rec.stage}`;
}
const refs = (type: BinEntity, rec: any) => ({
  requirementId: type === 'REQUIREMENT' ? rec.id : rec.requirementId ?? null,
  requirementCode: type === 'REQUIREMENT' ? rec.code : null,
  clientId: type === 'CLIENT' ? rec.id : rec.clientId ?? null,
  propertyId: type === 'PROPERTY' ? rec.id : rec.propertyId ?? null,
  dealId: type === 'DEAL' ? rec.id : null,
});

// Soft delete: affects ONLY the given record (by its own id) and records a BinItem.
export async function moveToBin(actor: Actor, type: BinEntity, rec: any, reason?: string | null) {
  const model = (prisma as any)[MODEL[type]];
  await model.update({ where: { id: rec.id }, data: { deletedAt: new Date() } });
  const item = await prisma.binItem.create({
    data: {
      entityType: type, entityId: rec.id, entityCode: rec.code ?? null, label: labelOf(type, rec), ownerId: rec.ownerId,
      deletedById: actor.kind === 'pc' ? actor.userId : actor.adminId, deletedByType: actor.kind === 'pc' ? 'PC' : 'ADMIN',
      reason: reason || null, snapshot: JSON.parse(JSON.stringify(rec)),
    },
  });
  await logActivity(actor, {
    entityType: type, entityId: rec.id, entityCode: rec.code, ownerId: rec.ownerId, action: `${type}_DELETED`,
    description: `${type[0] + type.slice(1).toLowerCase()} ${rec.code || rec.name} moved to Bin${reason ? ` — ${reason}` : ''}`, ...refs(type, rec),
  });
  return item;
}

async function loadBinItem(actor: Actor, id: string) {
  const item = await prisma.binItem.findUnique({ where: { id } });
  if (!item) throw notFound('Bin item');
  if (actor.kind === 'pc' && item.ownerId !== actor.userId) throw forbidden();
  if (item.status !== 'IN_BIN') throw badRequest(`This item was already ${item.status.toLowerCase()}`);
  return item;
}

// Restore keeps the original id and human code (e.g. REQ-000002).
export async function restoreFromBin(actor: Actor, id: string) {
  const item = await loadBinItem(actor, id);
  const type = item.entityType as BinEntity;
  const model = (prisma as any)[MODEL[type]];
  const rec = await model.findUnique({ where: { id: item.entityId }, include: type === 'CLIENT' || type === 'PROPERTY' ? undefined : { client: true } });
  if (!rec) throw notFound('Original record');
  if (type !== 'CLIENT' && type !== 'PROPERTY' && rec.client?.deletedAt) throw badRequest('Restore the client first — this record belongs to a deleted client');
  const restored = await model.update({ where: { id: rec.id }, data: { deletedAt: null } });
  await prisma.binItem.update({ where: { id }, data: { status: 'RESTORED', restoredAt: new Date() } });
  await logActivity(actor, {
    entityType: type, entityId: rec.id, entityCode: rec.code, ownerId: rec.ownerId, action: `${type}_RESTORED`,
    description: `${type[0] + type.slice(1).toLowerCase()} ${rec.code || rec.name} restored from Bin`, ...refs(type, rec),
  });
  return restored;
}

// Permanent deletion removes the row. Human codes are never reused because counters only increase.
export async function purgeFromBin(actor: Actor, id: string) {
  const item = await loadBinItem(actor, id);
  const model = (prisma as any)[MODEL[item.entityType as BinEntity]];
  const rec = await model.findUnique({ where: { id: item.entityId } });
  if (rec) {
    if (item.entityType === 'PROPERTY') await prisma.propertyPhoto.deleteMany({ where: { propertyId: rec.id } });
    await model.delete({ where: { id: rec.id } });
  }
  return prisma.binItem.update({ where: { id }, data: { status: 'PURGED', purgedAt: new Date() } });
}
