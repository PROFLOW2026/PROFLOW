import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { calendarFeedTokens } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { Database } from '@/shared/db/types';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CalendarFeedTokenView {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastAccessedAt: Date | null;
  readonly revokedAt: Date | null;
}

export async function getActiveCalendarFeedToken(
  context: OrgContext,
): Promise<CalendarFeedTokenView | null> {
  const [row] = await context.db
    .select()
    .from(calendarFeedTokens)
    .where(
      and(
        eq(calendarFeedTokens.organizationId, context.organizationId),
        eq(calendarFeedTokens.userId, context.userId),
        isNull(calendarFeedTokens.revokedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Creates a new feed token (revokes any previous active token). Returns the raw secret once. */
export async function rotateCalendarFeedToken(
  context: OrgContext,
): Promise<{ rawToken: string; token: CalendarFeedTokenView }> {
  const now = new Date();
  await context.db
    .update(calendarFeedTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(calendarFeedTokens.organizationId, context.organizationId),
        eq(calendarFeedTokens.userId, context.userId),
        isNull(calendarFeedTokens.revokedAt),
      ),
    );

  const rawToken = randomBytes(32).toString('base64url');
  const [row] = await context.db
    .insert(calendarFeedTokens)
    .values({
      organizationId: context.organizationId,
      userId: context.userId,
      tokenHash: hashToken(rawToken),
    })
    .returning();

  return { rawToken, token: row! };
}

export async function revokeCalendarFeedToken(context: OrgContext): Promise<void> {
  await context.db
    .update(calendarFeedTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(calendarFeedTokens.organizationId, context.organizationId),
        eq(calendarFeedTokens.userId, context.userId),
        isNull(calendarFeedTokens.revokedAt),
      ),
    );
}

export async function resolveCalendarFeedByRawToken(
  db: Database,
  rawToken: string,
): Promise<{
  organizationId: string;
  userId: string;
  tokenId: string;
} | null> {
  const tokenHash = hashToken(rawToken.trim());
  const [row] = await db
    .select()
    .from(calendarFeedTokens)
    .where(and(eq(calendarFeedTokens.tokenHash, tokenHash), isNull(calendarFeedTokens.revokedAt)))
    .limit(1);

  if (!row) return null;

  await db
    .update(calendarFeedTokens)
    .set({ lastAccessedAt: new Date() })
    .where(eq(calendarFeedTokens.id, row.id));

  return {
    organizationId: row.organizationId,
    userId: row.userId,
    tokenId: row.id,
  };
}
