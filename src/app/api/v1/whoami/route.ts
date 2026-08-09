import { NextResponse } from 'next/server';
import { isAppError } from '@/shared/errors';
import {
  API_KEY_SCOPES,
  assertApiKeyHasAnyScope,
  authenticateApiKey,
  resolveApiWhoami,
} from '@/modules/api';
import { isDatabaseConfigured } from '@/shared/db/client';

/**
 * Versioned API stub (doc 32). Validates API key hash via Authorization: Bearer.
 * Does not use Next.js session cookies — separate from browser auth.
 * Scopes are checked on every authenticated route (whoami requires any issued scope).
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
    const auth = await authenticateApiKey(match[1]);
    assertApiKeyHasAnyScope(auth, API_KEY_SCOPES);
    const whoami = await resolveApiWhoami(auth);
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
