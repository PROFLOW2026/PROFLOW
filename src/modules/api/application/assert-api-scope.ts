import { AuthorizationError } from '@/shared/errors';
import type { ApiKeyScope, AuthenticatedApiKey } from '../domain/types';

/**
 * Enforces API key scopes on versioned API routes. Call after authenticateApiKey
 * for every data endpoint (identity probes like whoami may omit this).
 */
export function assertApiKeyHasScope(
  auth: AuthenticatedApiKey,
  scope: ApiKeyScope,
): void {
  if (!auth.scopes.includes(scope)) {
    throw new AuthorizationError(scope);
  }
}

export function assertApiKeyHasAnyScope(
  auth: AuthenticatedApiKey,
  scopes: readonly ApiKeyScope[],
): void {
  if (!scopes.some((scope) => auth.scopes.includes(scope))) {
    throw new AuthorizationError(scopes.join(' | '));
  }
}
