import { NextResponse } from 'next/server';
import { resolveOrgContext } from '@/modules/tenancy';
import { buildMyWorkIcsFeed } from '@/modules/calendar/application/build-my-work-ics';
import { resolveCalendarFeedByRawToken } from '@/modules/calendar/application/calendar-feed-tokens';
import { getAdminDb, withUserContext } from '@/shared/db/client';

const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;
const WINDOW_MS = 60_000;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (rateLimited(token.slice(0, 16))) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  const db = getAdminDb();
  const resolved = await resolveCalendarFeedByRawToken(db, token);
  if (!resolved) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ics = await withUserContext(resolved.userId, async (tx) => {
    const orgContext = await resolveOrgContext(tx, {
      userId: resolved.userId,
      organizationId: resolved.organizationId,
      locale: 'en',
    });
    return buildMyWorkIcsFeed(orgContext);
  }, db);

  return new NextResponse(ics as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
