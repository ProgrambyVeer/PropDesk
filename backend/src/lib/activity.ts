import type { Request } from 'express';
import { prisma } from './prisma';
import type { Actor } from '../types';

export interface ActivityInput {
  entityType: 'CLIENT' | 'REQUIREMENT' | 'PROPERTY' | 'DEAL' | 'FOLLOW_UP' | 'LINK' | 'SHARE' | 'PROFILE';
  entityId: string;
  entityCode?: string | null;
  action: string;
  description: string;
  ownerId: string;
  requirementId?: string | null;
  requirementCode?: string | null;
  clientId?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logActivity(actor: Actor, a: ActivityInput) {
  const { ownerId, metadata, ...rest } = a;
  return prisma.activityLog.create({
    data: {
      ...rest,
      userId: ownerId,
      adminId: actor.kind === 'admin' ? actor.adminId : null,
      metadata: { ...(metadata || {}), by: actor.kind === 'admin' ? `admin:${actor.name}` : 'pc' } as any,
    },
  });
}

export async function audit(req: Request, a: {
  action: string; entityType?: string; entityId?: string; entityCode?: string | null; requirementCode?: string | null;
  affectedPcId?: string | null; before?: unknown; after?: unknown; adminId?: string | null;
}) {
  const adminId = a.adminId ?? (req.actor?.kind === 'admin' ? req.actor.adminId : null);
  return prisma.adminAuditLog.create({
    data: {
      adminId, action: a.action, entityType: a.entityType, entityId: a.entityId, entityCode: a.entityCode ?? null,
      requirementCode: a.requirementCode ?? null, affectedPcId: a.affectedPcId ?? null,
      ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      before: (a.before ?? undefined) as any, after: (a.after ?? undefined) as any,
    },
  });
}
