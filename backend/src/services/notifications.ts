import type { FollowUp, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { nextCode } from '../lib/codes';
import { getSetting } from '../lib/settings';
import { logger } from '../lib/logger';
import { push } from '../providers/messaging';
import { config } from '../config';

export async function notify(n: {
  recipientId: string; type: NotificationType; title: string; body: string; link?: string;
  clientId?: string | null; requirementId?: string | null; propertyId?: string | null; dealId?: string | null; followUpId?: string | null;
  scheduledFor?: Date;
}) {
  const scheduled = n.scheduledFor && n.scheduledFor > new Date();
  const row = await prisma.notification.create({
    data: { ...n, code: await nextCode('NTF'), status: scheduled ? 'PENDING' : 'DELIVERED', scheduledFor: n.scheduledFor ?? new Date(), deliveredAt: scheduled ? null : new Date() },
  });
  if (!scheduled) push.send(n.recipientId, n.title, n.body).catch(() => undefined);
  return row;
}

const fuTitle = (fu: FollowUp & { client?: { name: string } | null }) =>
  `${fu.type.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} with ${fu.client?.name ?? 'client'}`;

// (Re)builds the reminder + due notifications for a follow-up. Called on create, edit and reschedule.
export async function scheduleFollowUpNotifications(followUpId: string) {
  const fu = await prisma.followUp.findUnique({ where: { id: followUpId }, include: { client: { select: { name: true } }, requirement: { select: { code: true } } } });
  if (!fu) return;
  await prisma.notification.updateMany({ where: { followUpId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (!['SCHEDULED', 'RESCHEDULED'].includes(fu.status)) return;
  const when = fu.scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const reqTxt = fu.requirement ? ` · ${fu.requirement.code}` : '';
  const reminderAt = new Date(fu.scheduledAt.getTime() - fu.reminderMinutes * 60e3);
  const base = { recipientId: fu.ownerId, clientId: fu.clientId, requirementId: fu.requirementId, propertyId: fu.propertyId, dealId: fu.dealId, followUpId: fu.id, link: `/follow-ups?focus=${fu.id}` };
  if (fu.scheduledAt > new Date()) {
    await notify({ ...base, type: fu.type === 'SITE_VISIT' ? 'SITE_VISIT' : 'UPCOMING_FOLLOW_UP', title: `Upcoming: ${fuTitle(fu)}`, body: `Scheduled for ${when}${reqTxt}`, scheduledFor: reminderAt > new Date() ? reminderAt : new Date() });
    await notify({ ...base, type: 'DUE_FOLLOW_UP', title: `Due now: ${fuTitle(fu)}`, body: `${fu.code} is due (${when})${reqTxt}`, scheduledFor: fu.scheduledAt });
  }
}

export async function cancelFollowUpNotifications(followUpId: string) {
  await prisma.notification.updateMany({ where: { followUpId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
}

export async function runSchedulerTick() {
  const now = new Date();
  const due = await prisma.notification.findMany({ where: { status: 'PENDING', scheduledFor: { lte: now } }, take: 500 });
  for (const n of due) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'DELIVERED', deliveredAt: now } });
    push.send(n.recipientId, n.title, n.body).catch(() => undefined);
  }
  const grace = await getSetting<number>('followup.missedGraceMinutes');
  const missed = await prisma.followUp.findMany({
    where: { status: { in: ['SCHEDULED', 'RESCHEDULED'] }, deletedAt: null, scheduledAt: { lt: new Date(now.getTime() - grace * 60e3) } },
    include: { client: { select: { name: true } } }, take: 200,
  });
  for (const fu of missed) {
    await prisma.followUp.update({ where: { id: fu.id }, data: { status: 'MISSED' } });
    await notify({ recipientId: fu.ownerId, type: 'MISSED_FOLLOW_UP', title: `Missed: ${fuTitle(fu)}`, body: `${fu.code} was not completed. Reschedule it?`, clientId: fu.clientId, requirementId: fu.requirementId, followUpId: fu.id, link: `/follow-ups?focus=${fu.id}` });
  }
  return { delivered: due.length, missed: missed.length };
}

export function startScheduler() {
  const run = () => runSchedulerTick().catch((e) => logger.error('[scheduler]', e));
  setTimeout(run, 3000);
  return setInterval(run, config.schedulerIntervalSec * 1000);
}
