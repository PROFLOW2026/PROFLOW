import { AuthenticationRequiredError, DomainRuleError } from '@/shared/errors';

import { getAdminDb } from '@/shared/db/client';

import {

  extractKeyPrefix,

  hashSecret,

  isSha256HexDigest,

  looksLikeApiKey,

  secretsEqual,

} from '../domain/api-key';

import { API_KEY_SCOPES, type ApiKeyScope, type AuthenticatedApiKey } from '../domain/types';

import {

  findApiKeyByPrefix,

  findOrganizationName,

  touchApiKeyLastUsed,

} from '../data/api.repository';



const KNOWN_SCOPES = new Set<string>(API_KEY_SCOPES);



function normalizeScopes(scopes: readonly string[]): ApiKeyScope[] {

  return scopes.filter((scope): scope is ApiKeyScope => KNOWN_SCOPES.has(scope));

}



/**

 * Validates a bearer API key using the admin connection (no session JWT).

 * Justified: API keys are org-scoped credentials looked up by prefix+hash only.

 * Tenant isolation is enforced by returning the key's organizationId for all

 * subsequent data access — never by trusting a client-supplied org id.

 */

export async function authenticateApiKey(plaintext: string): Promise<AuthenticatedApiKey> {

  const trimmed = plaintext.trim();

  if (!looksLikeApiKey(trimmed)) {

    throw new AuthenticationRequiredError('Invalid API key');

  }



  let prefix: string;

  try {

    prefix = extractKeyPrefix(trimmed);

  } catch {

    throw new AuthenticationRequiredError('Invalid API key');

  }



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



  if (!isSha256HexDigest(row.keyHash)) {

    throw new AuthenticationRequiredError('Invalid API key');

  }



  const candidateHash = hashSecret(trimmed);

  if (!secretsEqual(candidateHash, row.keyHash)) {

    throw new AuthenticationRequiredError('Invalid API key');

  }



  const scopes = normalizeScopes(row.scopes);

  if (scopes.length === 0) {

    throw new AuthenticationRequiredError('API key has no valid scopes');

  }



  await touchApiKeyLastUsed(db, row.id);



  return {

    keyId: row.id,

    apiClientId: row.apiClientId,

    organizationId: row.organizationId,

    scopes,

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


