import {
  API_KEY_SCOPES,
  assertApiKeyHasAnyScope,
  apiError,
  apiErrorCode,
  apiSuccess,
  requireApiKeyAuth,
  resolveApiWhoami,
} from '@/modules/api';
import { isDatabaseConfigured } from '@/shared/db/client';

/**
 * Versioned API identity probe (doc 32).
 * Authorization: Bearer <api_key> — no cookie session.
 * Requires any issued foundation scope (permission-equivalent).
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return apiErrorCode('database_unconfigured', 503, 'errors.serviceUnavailable');
  }

  const gated = await requireApiKeyAuth(request);
  if (!gated.ok) return gated.response;

  try {
    assertApiKeyHasAnyScope(gated.auth, API_KEY_SCOPES);
    const whoami = await resolveApiWhoami(gated.auth);
    return apiSuccess({
      keyId: whoami.keyId,
      apiClientId: whoami.apiClientId,
      organizationId: whoami.organizationId,
      organizationName: whoami.organizationName,
      clientName: whoami.clientName,
      scopes: whoami.scopes,
    });
  } catch (error) {
    return apiError(error);
  }
}
