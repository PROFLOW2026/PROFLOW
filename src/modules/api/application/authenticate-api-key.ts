import { AuthenticationRequiredError, DomainRuleError } from '@/shared/errors';
import { getAdminDb } from '@/shared/db/client';
import { extractKeyPrefix, hashSecret, secretsEqual } from '../domain/api-key';
import type { AuthenticatedApiKey } from '../domain/types';
import {
  findApiKeyByPrefix,
  findOrganizationName,
  touchApiKeyLastUsed,
} from '../data/api.repository';

/**
 * Validates a bearer API key using the admin connection (no session JWT).
 * Justified: API keys are org-scoped credentials looked up by prefix+hash only.
 */
export async function authenticateApiKey(plaintext: string): Promise<AuthenticatedApiKey> {
  const trimmed = plaintext.trim();
  if (!trimmed.startsWith('pfk_') || trimmed.length < 16) {
    throw new AuthenticationRequiredError('Invalid API key');
  }

  const prefix = extractKeyPrefix(trimmed);
  const db = getAdminDb();
  const row = await findApiKeyByPrefix(db, prefix);
  if (!row) throw new AuthenticationRequiredError('Invalid API key');

  if (row.revokedAt) throw new AuthenticationRequiredError('API key revoked');
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationRequiredError('API key expired');
  }
  if (row.clientStatus !== 'active') {
    throw new DomainRuleError('API client is disabled', 'errors.notAllowed');
  }

  const candidateHash = hashSecret(trimmed);
  if (!secretsEqual(candidateHash, row.keyHash)) {
    throw new AuthenticationRequiredError('Invalid API key');
  }

  await touchApiKeyLastUsed(db, row.id);

  return {
    keyId: row.id,
    apiClientId: row.apiClientId,
    organizationId: row.organizationId,
    scopes: row.scopes,
    clientName: row.clientName,
  };
}

export async function resolveApiWhoami(input: string | AuthenticatedApiKey): Promise<{
  keyId: string;
  apiClientId: string;
  organizationId: string;
  organizationName: string | null;
  clientName: string;
  scopes: readonly string[];
}> {
  const resolved = typeof input === 'string' ? await authenticateApiKey(input) : input;
  const db = getAdminDb();
  const organizationName = await findOrganizationName(db, resolved.organizationId);
  return {
    keyId: resolved.keyId,
    apiClientId: resolved.apiClientId,
    organizationId: resolved.organizationId,
    organizationName,
    clientName: resolved.clientName,
    scopes: resolved.scopes,
  };
}

