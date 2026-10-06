import type { AdminRole, AdminUser, User } from '@prisma/client';

export type PcActor = { kind: 'pc'; userId: string; name: string };
export type AdminActor = { kind: 'admin'; adminId: string; role: AdminRole; name: string };
export type Actor = PcActor | AdminActor;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: Actor;
      pc?: User;
      admin?: AdminUser;
      sessionId?: string;
    }
  }
}
