import { AuthenticationRequiredError } from '@/shared/errors';
import { isDatabaseConfigured } from '@/shared/db/client';
import { authenticateApiKey } from '../application/authenticate-api-key';
import type { AuthenticatedApiKey } from '../domain/types';
import { apiErrorCode } from './api-response';

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Resolves Bearer API-key auth for versioned routes.
 * Returns either the authenticated key or a ready-to-send error Response.
 */
export async function requireApiKeyAuth(
  request: Request,
): Promise<{ ok: true; auth: AuthenticatedApiKey } | { ok: false; response: Response }> {
  if (!isDatabaseConfigured()) {
    return { ok: false, response: apiErrorCode('database_unconfigured', 503, 'errors.serviceUnavailable') };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: apiErrorCode('missing_api_key', 401, 'errors.authenticationRequired') };
  }

  try {
    const auth = await authenticateApiKey(token);
    return { ok: true, auth };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { ok: false, response: apiErrorCode(error.code, error.status, error.messageKey) };
    }
    throw error;
  }
}
