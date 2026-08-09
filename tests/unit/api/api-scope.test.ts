import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@/shared/errors';
import {
  assertApiKeyHasAnyScope,
  assertApiKeyHasScope,
} from '@/modules/api/application/assert-api-scope';
import type { AuthenticatedApiKey } from '@/modules/api/domain/types';

const baseAuth: AuthenticatedApiKey = {
  keyId: '00000000-0000-4000-8000-000000000001',
  apiClientId: '00000000-0000-4000-8000-000000000002',
  organizationId: '00000000-0000-4000-8000-000000000003',
  scopes: ['projects.read'],
  clientName: 'test',
};

describe('assertApiKeyHasScope', () => {
  it('allows matching scope', () => {
    expect(() => assertApiKeyHasScope(baseAuth, 'projects.read')).not.toThrow();
  });

  it('rejects missing scope', () => {
    expect(() => assertApiKeyHasScope(baseAuth, 'billing.read')).toThrow(AuthorizationError);
  });

  it('allows any of listed scopes', () => {
    expect(() =>
      assertApiKeyHasAnyScope(baseAuth, ['billing.read', 'projects.read']),
    ).not.toThrow();
  });

  it('rejects when none of listed scopes match', () => {
    expect(() =>
      assertApiKeyHasAnyScope(baseAuth, ['billing.read', 'clients.read']),
    ).toThrow(AuthorizationError);
  });
});
