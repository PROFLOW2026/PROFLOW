import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/shared/env/server';
import type { StorageProviderKey } from '../domain/types';
import { DomainRuleError } from '@/shared/errors';

const STATE_TTL_MS = 15 * 60 * 1000;

function stateSecret(): string {
  const env = serverEnv();
  return (
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.DATABASE_URL ||
    'projectflow.storage.oauth.local'
  );
}

export function buildOAuthRedirectUri(provider: StorageProviderKey): string {
  const base = serverEnv().APP_URL.replace(/\/+$/, '');
  return `${base}/api/org-storage/oauth/${provider}/callback`;
}

export function createOAuthState(input: {
  organizationId: string;
  userId: string;
  connectionId: string;
  provider: StorageProviderKey;
}): string {
  const nonce = randomBytes(16).toString('base64url');
  const payload = JSON.stringify({
    ...input,
    exp: Date.now() + STATE_TTL_MS,
    nonce,
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string): {
  organizationId: string;
  userId: string;
  connectionId: string;
  provider: StorageProviderKey;
} {
  const [encoded, sig] = state.split('.');
  if (!encoded || !sig) {
    throw new DomainRuleError('Invalid OAuth state', 'externalStorage.errors.oauthState');
  }
  const expected = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  const left = Buffer.from(sig, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new DomainRuleError('Invalid OAuth state signature', 'externalStorage.errors.oauthState');
  }

  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
    organizationId: string;
    userId: string;
    connectionId: string;
    provider: StorageProviderKey;
    exp: number;
  };

  if (!parsed.exp || parsed.exp < Date.now()) {
    throw new DomainRuleError('OAuth state expired', 'externalStorage.errors.oauthState');
  }

  return parsed;
}
