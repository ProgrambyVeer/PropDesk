import { prisma } from './prisma';

export type CodePrefix = 'REQ' | 'PROP' | 'CLI' | 'DEAL' | 'FU' | 'NTF' | 'PC';

// Atomic, monotonically increasing counters. Values are never decremented, so codes are never reused,
// even after permanent deletion.
export async function nextCode(prefix: CodePrefix): Promise<string> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter"("name","value") VALUES (${prefix}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${String(rows[0].value).padStart(6, '0')}`;
}
