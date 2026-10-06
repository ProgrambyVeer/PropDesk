import type { DealStage, RequirementType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, fieldError, forbidden, inr, parse } from '../lib/http';
import { nextCode } from '../lib/codes';
import { loadOwned, canViewProperty } from '../lib/scope';
import { logActivity } from '../lib/activity';
import { getSetting } from '../lib/settings';
import { notify } from './notifications';
import { optDate, optNum, optStr } from './validation';
import type { Actor } from '../types';

export const STAGES: DealStage[] = ['NEW', 'CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED', 'LOST'];
export const PROBABILITY: Record<DealStage, number> = { NEW: 10, CONTACTED: 20, INTERESTED: 35, SITE_VISIT_SCHEDULED: 50, SITE_VISIT_COMPLETED: 60, NEGOTIATION: 75, DOCUMENTATION: 90, CLOSED: 100, LOST: 0 };
const OPPOSITE: Record<RequirementType, RequirementType> = {
  BUY_LOOKING: 'SELL_OFFERING', SELL_OFFERING: 'BUY_LOOKING', RENT_LOOKING: 'RENT_OFFERING', RENT_OFFERING: 'RENT_LOOKING', LEASE_LOOKING: 'LEASE_OFFERING', LEASE_OFFERING: 'LEASE_LOOKING',
};
const human = (t: string) => t.replace(/_/g, ' ');

export const expectedCommission = (value?: number | null, pct?: number | null, fixed?: number | null) =>
  fixed != null ? fixed : value != null && pct != null ? Math.round((value * pct) / 100) : null;

// A client cannot be e.g. BUY LOOKING and SELL OFFERING for the same property.
export async function assertNoConflict(clientId: string, propertyId: string, type: RequirementType, excludeRequirementId?: string) {
  const c = await prisma.propertyClient.findFirst({
    where: { clientId, propertyId, status: 'ACTIVE', requirementId: excludeRequirementId ? { not: excludeRequirementId } : undefined, requirement: { type: OPPOSITE[type], deletedAt: null } },
    include: { requirement: { select: { code: true, type: true } }, property: { select: { code: true } } },
  });
  if (c) throw conflict(`Conflict: this client is already ${human(c.requirement.type)} for ${c.property.code} (${c.requirement.code}). A client cannot be ${human(type)} and ${human(c.requirement.type)} for the same property.`);
}

/* ---------------- Links ---------------- */
export const linkSchema = z.object({
  clientId: z.string().min(1), requirementId: z.string().min(1), propertyId: z.string().min(1),
  interestLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(), notes: optStr, dealValue: optNum, commission: optNum,
});

export async function createLink(actor: Actor, input: z.infer<typeof linkSchema>) {
  const req = await loadOwned<any>('requirement', input.requirementId, actor);
  if (req.clientId !== input.clientId && req.client?.id !== input.clientId) {
    const client = await loadOwned<any>('client', input.clientId, actor);
    if (client.id !== req.clientId) throw badRequest('Requirement does not belong to this client');
  }
  const property = await prisma.property.findFirst({ where: { OR: [{ id: input.propertyId }, { code: input.propertyId }], deletedAt: null } });
  if (!property) throw badRequest('Property not found');
  const access = await canViewProperty(actor, property);
  if (!access || (actor.kind === 'admin' && property.ownerId !== req.ownerId)) throw forbidden('You cannot link this property');
  await assertNoConflict(req.clientId, property.id, req.type);
  const existing = await prisma.propertyClient.findUnique({ where: { requirementId_propertyId: { requirementId: req.id, propertyId: property.id } } });
  if (existing?.status === 'ACTIVE') throw conflict(`${property.code} is already linked to ${req.code}`);
  const data = { interestLevel: input.interestLevel ?? 'MEDIUM', notes: input.notes ?? null, dealValue: input.dealValue ?? null, commission: input.commission ?? null };
  const link = existing
    ? await prisma.propertyClient.update({ where: { id: existing.id }, data: { ...data, status: 'ACTIVE' } })
    : await prisma.propertyClient.create({ data: { ...data, ownerId: req.ownerId, clientId: req.clientId, propertyId: property.id, requirementId: req.id } });
  await logActivity(actor, {
    entityType: 'LINK', entityId: link.id, ownerId: req.ownerId, action: 'PROPERTY_LINKED', description: `${property.code} linked to ${req.code}`,
    requirementId: req.id, requirementCode: req.code, clientId: req.clientId, propertyId: property.id,
  });
  return link;
}

/* ---------------- Deals ---------------- */
export const dealCreateSchema = z.object({
  clientId: z.string().min(1), requirementId: z.string().min(1), propertyId: z.string().min(1),
  dealValue: optNum, commissionPercent: optNum, commissionFixed: optNum, notes: optStr,
});
export const dealUpdateSchema = z.object({ dealValue: optNum, commissionPercent: optNum, commissionFixed: optNum, finalCommission: optNum, notes: optStr });
export const stageSchema = z.object({
  stage: z.enum(STAGES as [DealStage, ...DealStage[]]), note: optStr, dealValue: optNum, finalCommission: optNum, commissionPercent: optNum,
  closingDate: optDate, lossReason: optStr,
});

export async function createDeal(actor: Actor, body: unknown) {
  const input = parse(dealCreateSchema, body);
  const req = await loadOwned<any>('requirement', input.requirementId, actor);
  if (req.clientId !== input.clientId) {
    const client = await loadOwned<any>('client', input.clientId, actor);
    if (client.id !== req.clientId) throw badRequest('Requirement does not belong to this client');
  }
  const property = await prisma.property.findFirst({ where: { OR: [{ id: input.propertyId }, { code: input.propertyId }], deletedAt: null } });
  if (!property) throw badRequest('Property not found');
  if (!(await canViewProperty(actor, property))) throw forbidden('You cannot create a deal on this property');
  let link = await prisma.propertyClient.findUnique({ where: { requirementId_propertyId: { requirementId: req.id, propertyId: property.id } } });
  if (!link || link.status !== 'ACTIVE') link = await createLink(actor, { clientId: req.clientId, requirementId: req.id, propertyId: property.id });
  const open = await prisma.deal.findFirst({ where: { requirementId: req.id, propertyId: property.id, deletedAt: null, stage: { notIn: ['CLOSED', 'LOST'] } } });
  if (open) throw conflict(`An open deal (${open.code}) already exists for ${req.code} and ${property.code}`);
  const pct = input.commissionPercent ?? (input.commissionFixed == null ? await getSetting<number>('commission.defaultPercent') : null);
  const deal = await prisma.deal.create({
    data: {
      code: await nextCode('DEAL'), ownerId: req.ownerId, clientId: req.clientId, propertyId: property.id, requirementId: req.id, linkId: link.id,
      dealValue: input.dealValue ?? null, commissionPercent: pct, commissionFixed: input.commissionFixed ?? null,
      expectedCommission: expectedCommission(input.dealValue, pct, input.commissionFixed), notes: input.notes ?? null,
      history: { create: { toStage: 'NEW', note: 'Deal created', changedBy: actor.name || actor.kind } },
    },
  });
  await logActivity(actor, {
    entityType: 'DEAL', entityId: deal.id, entityCode: deal.code, ownerId: deal.ownerId, action: 'DEAL_CREATED',
    description: `Deal ${deal.code} created for ${req.code} · ${property.code}${deal.dealValue ? ` · ${inr(deal.dealValue)}` : ''}`,
    requirementId: req.id, requirementCode: req.code, clientId: req.clientId, propertyId: property.id, dealId: deal.id,
  });
  return deal;
}

export async function updateDeal(actor: Actor, id: string, body: unknown) {
  const input = parse(dealUpdateSchema, body);
  const deal = await loadOwned<any>('deal', id, actor, { include: { requirement: { select: { code: true } } } });
  const next = { ...deal, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const exp = expectedCommission(next.dealValue, next.commissionPercent, next.commissionFixed);
  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: { dealValue: next.dealValue, commissionPercent: next.commissionPercent, commissionFixed: next.commissionFixed, finalCommission: next.finalCommission, notes: next.notes, expectedCommission: exp },
  });
  const commissionChanged = exp !== deal.expectedCommission || next.finalCommission !== deal.finalCommission;
  await logActivity(actor, {
    entityType: 'DEAL', entityId: deal.id, entityCode: deal.code, ownerId: deal.ownerId, action: commissionChanged ? 'COMMISSION_CHANGED' : 'DEAL_EDITED',
    description: commissionChanged ? `Commission for ${deal.code} changed: expected ${inr(deal.expectedCommission)} → ${inr(exp)}` : `Deal ${deal.code} updated`,
    requirementId: deal.requirementId, requirementCode: deal.requirement.code, clientId: deal.clientId, propertyId: deal.propertyId, dealId: deal.id,
    metadata: { before: { dealValue: deal.dealValue, expectedCommission: deal.expectedCommission, finalCommission: deal.finalCommission }, after: { dealValue: updated.dealValue, expectedCommission: exp, finalCommission: updated.finalCommission } },
  });
  return updated;
}

const STATUS_ON_CLOSE: Record<RequirementType, 'SOLD' | 'RENTED' | 'LEASED' | null> = {
  BUY_LOOKING: 'SOLD', SELL_OFFERING: 'SOLD', RENT_LOOKING: 'RENTED', RENT_OFFERING: 'RENTED', LEASE_LOOKING: 'LEASED', LEASE_OFFERING: 'LEASED',
};

export async function changeStage(actor: Actor, id: string, body: unknown) {
  const input = parse(stageSchema, body);
  const deal = await loadOwned<any>('deal', id, actor, { include: { requirement: true, property: { select: { code: true } } } });
  if (deal.stage === input.stage) throw badRequest(`Deal is already in ${human(input.stage)}`);
  const data: any = { stage: input.stage };
  if (input.stage === 'CLOSED') {
    const value = input.dealValue ?? deal.dealValue;
    const pct = input.commissionPercent ?? deal.commissionPercent;
    const final = input.finalCommission ?? expectedCommission(value, pct, deal.commissionFixed);
    const errors: Record<string, string> = {};
    if (!value) errors.dealValue = 'Deal value is required to close';
    if (final == null) errors.finalCommission = 'Final commission is required to close';
    if (!input.closingDate) errors.closingDate = 'Closing date is required';
    if (Object.keys(errors).length) throw fieldError(errors);
    Object.assign(data, { dealValue: value, commissionPercent: pct, finalCommission: final, closingDate: input.closingDate, expectedCommission: expectedCommission(value, pct, deal.commissionFixed), notes: input.note ?? deal.notes, lossReason: null });
  } else if (input.stage === 'LOST') {
    if (!input.lossReason) throw fieldError({ lossReason: 'Loss reason is required' });
    Object.assign(data, { lossReason: input.lossReason, closingDate: null });
  }
  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: { ...data, history: { create: { fromStage: deal.stage, toStage: input.stage, note: input.note ?? input.lossReason ?? null, changedBy: actor.name || actor.kind } } },
  });
  if (deal.linkId) await prisma.propertyClient.update({ where: { id: deal.linkId }, data: { dealStage: input.stage } }).catch(() => undefined);
  if (input.stage === 'CLOSED') {
    const st = STATUS_ON_CLOSE[deal.requirement.type as RequirementType];
    if (st) await prisma.property.update({ where: { id: deal.propertyId }, data: { status: st } });
    await prisma.requirement.update({ where: { id: deal.requirementId }, data: { status: 'FULFILLED' } });
  }
  const refs = { requirementId: deal.requirementId, requirementCode: deal.requirement.code, clientId: deal.clientId, propertyId: deal.propertyId, dealId: deal.id };
  await logActivity(actor, {
    entityType: 'DEAL', entityId: deal.id, entityCode: deal.code, ownerId: deal.ownerId, action: 'DEAL_STAGE_CHANGED',
    description: `${deal.code}: ${human(deal.stage)} → ${human(input.stage)}`, metadata: { from: deal.stage, to: input.stage, note: input.note }, ...refs,
  });
  if (input.stage === 'CLOSED') {
    await logActivity(actor, { entityType: 'DEAL', entityId: deal.id, entityCode: deal.code, ownerId: deal.ownerId, action: 'DEAL_CLOSED', description: `${deal.code} closed at ${inr(updated.dealValue)} · commission ${inr(updated.finalCommission)}`, ...refs });
  }
  await notify({ recipientId: deal.ownerId, type: 'DEAL_STAGE_UPDATE', title: `${deal.code} moved to ${human(input.stage)}`, body: `${deal.requirement.code} · ${deal.property.code}`, dealId: deal.id, requirementId: deal.requirementId, clientId: deal.clientId, propertyId: deal.propertyId, link: `/deals/${deal.id}` });
  return updated;
}
