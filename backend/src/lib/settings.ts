import { prisma } from './prisma';

export const DEFAULT_SETTINGS: Record<string, { category: string; value: unknown }> = {
  'auth.otpExpirySeconds': { category: 'Authentication', value: 300 },
  'auth.maxOtpAttempts': { category: 'Authentication', value: 5 },
  'auth.allowSelfSignup': { category: 'Authentication', value: true },
  'auth.admin2faRequired': { category: 'Authentication', value: false },
  'matching.minScore': { category: 'Matching Engine', value: 40 },
  'matching.notifyScore': { category: 'Matching Engine', value: 75 },
  'commission.defaultPercent': { category: 'Default Commission', value: 1 },
  'followup.defaultReminderMinutes': { category: 'Follow-up', value: 30 },
  'followup.missedGraceMinutes': { category: 'Follow-up', value: 60 },
  'notifications.browserEnabled': { category: 'Notifications', value: true },
  'email.fromAddress': { category: 'Email', value: 'no-reply@example.com' },
  'push.enabled': { category: 'Push Notifications', value: false },
};

export async function getSetting<T = any>(key: string): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return (row ? row.value : DEFAULT_SETTINGS[key]?.value) as T;
}
