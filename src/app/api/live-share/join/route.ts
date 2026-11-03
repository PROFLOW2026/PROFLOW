import { NextResponse } from 'next/server';
import { z } from 'zod';
import { joinLiveShare, LiveShareError } from '@/modules/infra-mapping/application/live-share';
import {
  LIVE_SHARE_MESSAGES,
  LIVE_VIEWER_KEY_PATTERN,
  type LiveShareErrorCode,
  type LiveShareResult,
  type LiveShareViewerSession,
} from '@/modules/infra-mapping/domain/live-share';
import { liveShareDeps } from '@/modules/infra-mapping/live-share-server';
import { logger } from '@/shared/observability/logger';

/**
 * PUBLIC endpoint for the watching phone of a live camera share (no account, no cookies, no session).
 *
 * It is deliberately the only anonymous surface of this feature and does exactly one thing: exchange a signed,
 * short-lived viewer link for a subscribe-only LiveKit video token for that one room. The link carries no
 * organization or project, nothing else is read or written, and LiveKit keys never leave the server.
 */

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  viewerToken: z.string().min(1).max(512),
  viewerKey: z.string().regex(LIVE_VIEWER_KEY_PATTERN),
});

const STATUS: Readonly<Record<LiveShareErrorCode, number>> = {
  invalid_link: 400,
  expired: 410,
  ended: 410,
  viewer_taken: 409,
  not_configured: 503,
  unavailable: 503,
};

// Best-effort, per instance: a link is only useful for a few joins, so this just blunts hammering.
const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
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

function respond(result: LiveShareResult<LiveShareViewerSession>, status: number): NextResponse {
  return NextResponse.json(result, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

function failure(code: LiveShareErrorCode): NextResponse {
  return respond({ ok: false, error: LIVE_SHARE_MESSAGES[code], code }, STATUS[code]);
}

export async function POST(request: Request): Promise<NextResponse> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return failure('invalid_link');
  }
  if (raw.length > 2048) return failure('invalid_link');

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch {
    return failure('invalid_link');
  }

  if (rateLimited(parsed.viewerToken.slice(0, 24))) {
    return respond({ ok: false, error: LIVE_SHARE_MESSAGES.unavailable, code: 'unavailable' }, 429);
  }

  try {
    const joined = await joinLiveShare(parsed, liveShareDeps);
    return respond({ ok: true, data: { url: joined.url, token: joined.token } }, 200);
  } catch (error) {
    if (error instanceof LiveShareError) return failure(error.code);
    logger.error('infra.live_share_join_failed', { name: error instanceof Error ? error.name : 'unknown' });
    return failure('unavailable');
  }
}
