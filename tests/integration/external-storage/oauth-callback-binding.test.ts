import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbClient from '@/shared/db/client';
import type { Transaction } from '@/shared/db/types';
import type { TestDatabase } from '../../setup/database';

vi.mock('server-only', () => ({}));

const { testDbHolder } = vi.hoisted(() => ({
  testDbHolder: { db: null as TestDatabase | null },
}));

vi.mock('@/shared/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof DbClient>();
  return {
    ...actual,
    getDb: () => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.db;
    },
    getAdminDb: () => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.adminDb;
    },
    withUserContext: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.asUser(userId, fn);
    },
  };
});

import * as providerRegistry from '@/modules/external-storage/providers/registry';
import { completeStorageOAuth } from '@/modules/external-storage/application/connection-service';
import { createOAuthState, verifyOAuthState } from '@/modules/external-storage/application/oauth-state';
import { createOrganization } from '@/modules/tenancy';
import { organizationStorageConnections } from '@drizzle/schema';
import { loadStorageConnectionCredentials } from '@/modules/external-storage/data/credentials.repository';
import { eq } from 'drizzle-orm';
import { DomainRuleError } from '@/shared/errors';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

describe('storage OAuth callback binding (integration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.PROJECTFLOW_TEST_INLINE_COMMITTED_STORAGE = '1';
    process.env.PROJECTFLOW_TEST_SKIP_STORAGE_PROVISION = '1';
    database = await createTestDatabase();
    testDbHolder.db = database;
    vi.spyOn(providerRegistry, 'getStorageProviderAdapter').mockReturnValue({
      exchangeAuthorizationCode: vi.fn().mockResolvedValue({
        accessToken: 'access-test',
        refreshToken: 'refresh-test',
        expiresAt: new Date(Date.now() + 3600_000),
        scopes: ['Files.ReadWrite'],
      }),
      getAccountInfo: vi.fn().mockResolvedValue({
        accountId: 'acct-1',
        email: 'user@test.example',
      }),
    } as never);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  async function seedConnectingConnection(userA: string, userB: string, orgId: string) {
    const connectionId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(organizationStorageConnections).values({
        id: connectionId,
        organizationId: orgId,
        provider: 'onedrive',
        status: 'connecting',
        isPrimary: true,
        externalAccountId: 'pending-account',
        externalAccountName: 'Pending',
        externalAccountEmail: 'pending@test.example',
        rootFolderExternalId: 'pending-root',
        rootFolderName: 'ProjectFlow',
        scopesJson: [],
        connectedByUserId: userA,
        connectedAt: null,
        lastValidatedAt: null,
      });
    });
    return connectionId;
  }

  it('valid callback: initiating user completes for org', async () => {
    await seedSystem(database);
    const user = await createTestUser(database, 'oauth-user-a@test.example');
    const { organization } = await database.asService(async (db) =>
      createOrganization(db, user.id, { name: 'OAuth Org', countryCode: 'IL' }),
    );
    const connectionId = await seedConnectingConnection(user.id, user.id, organization.id);
    const state = createOAuthState({
      organizationId: organization.id,
      userId: user.id,
      connectionId,
      provider: 'onedrive',
    });

    const result = await completeStorageOAuth({
      provider: 'onedrive',
      code: 'auth-code',
      state,
      sessionUserId: user.id,
    });
    expect(result.organizationId).toBe(organization.id);
    expect(result.connectionId).toBe(connectionId);

    const persisted = await database.asService(async (db) =>
      loadStorageConnectionCredentials(db, organization.id, connectionId),
    );
    expect(persisted?.accessToken).toBe('access-test');
    expect(persisted?.refreshToken).toBe('refresh-test');

    const [row] = await database.asService(async (db) =>
      db
        .select({ status: organizationStorageConnections.status })
        .from(organizationStorageConnections)
        .where(eq(organizationStorageConnections.id, connectionId)),
    );
    expect(row?.status).toBe('connected');
  });

  it('cross-user callback rejected', async () => {
    await seedSystem(database);
    const userA = await createTestUser(database, 'oauth-a@test.example');
    const userB = await createTestUser(database, 'oauth-b@test.example');
    const { organization } = await database.asService(async (db) =>
      createOrganization(db, userA.id, { name: 'OAuth Org', countryCode: 'IL' }),
    );
    const connectionId = await seedConnectingConnection(userA.id, userB.id, organization.id);
    const state = createOAuthState({
      organizationId: organization.id,
      userId: userA.id,
      connectionId,
      provider: 'onedrive',
    });

    await expect(
      completeStorageOAuth({
        provider: 'onedrive',
        code: 'auth-code',
        state,
        sessionUserId: userB.id,
      }),
    ).rejects.toMatchObject({ messageKey: 'externalStorage.errors.oauthSessionMismatch' });
  });

  it('tampered org in state payload rejected at verify', () => {
    const state = createOAuthState({
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      connectionId: '33333333-3333-4333-8333-333333333333',
      provider: 'onedrive',
    });
    const [payload] = state.split('.');
    const tampered = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    tampered.organizationId = '99999999-9999-4999-8999-999999999999';
    const encoded = Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64url');
    const sig = state.split('.')[1];
    expect(() => verifyOAuthState(`${encoded}.${sig}`)).toThrow(DomainRuleError);
  });

  it('invalid state signature rejected', () => {
    expect(() => verifyOAuthState('bad.state')).toThrow(DomainRuleError);
  });

  it('expired state rejected', async () => {
    const nonce = 'n';
    const payload = JSON.stringify({
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      connectionId: '33333333-3333-4333-8333-333333333333',
      provider: 'onedrive',
      exp: Date.now() - 1000,
      nonce,
    });
    const encoded = Buffer.from(payload, 'utf8').toString('base64url');
    const { createHmac } = await import('node:crypto');
    const { serverEnv } = await import('@/shared/env/server');
    const secret =
      process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim() ||
      serverEnv().SUPABASE_SERVICE_ROLE_KEY ||
      serverEnv().DATABASE_URL ||
      'projectflow.storage.oauth.local';
    const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
    expect(() => verifyOAuthState(`${encoded}.${sig}`)).toThrow(DomainRuleError);
  });

  it('wrong connection id for org rejected', async () => {
    await seedSystem(database);
    const user = await createTestUser(database, 'oauth-user-c@test.example');
    const { organization } = await database.asService(async (db) =>
      createOrganization(db, user.id, { name: 'OAuth Org C', countryCode: 'IL' }),
    );
    await seedConnectingConnection(user.id, user.id, organization.id);
    const state = createOAuthState({
      organizationId: organization.id,
      userId: user.id,
      connectionId: randomUUID(),
      provider: 'onedrive',
    });

    await expect(
      completeStorageOAuth({
        provider: 'onedrive',
        code: 'auth-code',
        state,
        sessionUserId: user.id,
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
