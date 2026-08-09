import { NextResponse } from 'next/server';
import { isAppError } from '@/shared/errors';
import { resolveApiWhoami } from '@/modules/api';
import { isDatabaseConfigured } from '@/shared/db/client';

/**
 * Versioned API stub (doc 32). Validates API key hash via Authorization: Bearer.
 * Does not use Next.js session cookies — separate from browser auth.
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'database_unconfigured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
  }

  try {
    const whoami = await resolveApiWhoami(match[1]);
    return NextResponse.json({
      apiVersion: 'v1',
      ...whoami,
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'unexpected' }, { status: 500 });
  }
}
