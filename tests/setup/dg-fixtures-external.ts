import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { contractorPrincipals } from '@drizzle/schema';
import { loadExternalContext } from '@/modules/contractor-access/application/load-external-context';
import type { ContractorAuthPort, ContractorSignInResult } from '@/modules/contractor-access/application/auth-port';
import type { ExternalContext } from '@/shared/external';
import type { TestDatabase } from './database';
import { createContractor, type ContractorFixture, type CreateContractorOptions } from './dg-fixtures';

/**
 * Track C fixtures (external identity). Requires migration 0156:
 *   $env:PF_WIP_FILES='0156_dg_external_identity.sql'
 *
 * - `createContractorAccount`: like `createContractor`, but the principal is a real contractor account
 *   (principal_kind = 'contractor', username, status active) so the PRODUCTION session loader accepts it.
 * - `loadContractorContext`: builds the ExternalContext through the production `loadExternalContext`
 *   (RLS-bound executor, own-grant reads) instead of the service-role shortcut in `externalContextFor`.
 * - `createFakeContractorAuth`: in-memory Supabase Auth port for lifecycle tests.
 */

export interface ContractorAccountFixture extends ContractorFixture {
  readonly username: string;
}

export async function createContractorAccount(
  database: TestDatabase,
  options: CreateContractorOptions & { readonly username?: string },
): Promise<ContractorAccountFixture> {
  const fixture = await createContractor(database, options);
  const username = (options.username ?? `${options.label}-${randomUUID().slice(0, 6)}`).toLowerCase();
  await database.asService((db) =>
    db
      .update(contractorPrincipals)
      .set({
        principalKind: 'contractor',
        status: 'active',
        username,
        usernameNormalized: username,
        homeOrganizationId: options.organizationId,
        activatedAt: new Date(),
        passwordSetAt: new Date(),
      })
      .where(eq(contractorPrincipals.id, fixture.principalId)),
  );
  return { ...fixture, username };
}

/** Production loader; throws when the principal is rejected (inactive / revoked session / not contractor). */
export async function loadContractorContext(
  database: TestDatabase,
  contractor: Pick<ContractorFixture, 'authUser'>,
  options: { sessionAuthenticatedAt?: Date | null } = {},
): Promise<ExternalContext> {
  const result = await loadExternalContext(database.db, {
    authUserId: contractor.authUser.id,
    sessionAuthenticatedAt: options.sessionAuthenticatedAt ?? new Date(),
    fallbackLocale: 'en',
  });
  if (!result.ok) throw new Error(`external context rejected: ${result.reason}`);
  return result.context;
}

export interface FakeContractorAuth extends ContractorAuthPort {
  readonly users: Map<string, { email: string; password: string; banned: boolean }>;
  /** Auth user id currently "signed in" on the fake request. */
  current: string | null;
}

/**
 * In-memory auth port. `onCreateUser` lets tests create the matching `profiles` row (the production
 * flow inserts it in the same transaction as the principal).
 */
export function createFakeContractorAuth(): FakeContractorAuth {
  const users = new Map<string, { email: string; password: string; banned: boolean }>();
  const fake: FakeContractorAuth = {
    users,
    current: null,
    async createUser({ email, password }) {
      const authUserId = randomUUID();
      users.set(authUserId, { email, password, banned: false });
      return { authUserId };
    },
    async deleteUser(authUserId) {
      users.delete(authUserId);
    },
    async setPassword(authUserId, password) {
      const user = users.get(authUserId);
      if (!user) throw new Error('unknown auth user');
      user.password = password;
    },
    async updateUserEmail(authUserId, email) {
      const user = users.get(authUserId);
      if (!user) throw new Error('unknown auth user');
      user.email = email;
    },
    async setBanned(authUserId, banned) {
      const user = users.get(authUserId);
      if (user) user.banned = banned;
    },
    async signInWithPassword(email, password): Promise<ContractorSignInResult> {
      for (const [id, user] of users) {
        if (user.email === email && user.password === password && !user.banned) {
          fake.current = id;
          return { ok: true, authUserId: id };
        }
      }
      return { ok: false, reason: 'invalid_credentials' };
    },
    async verifyPassword(email, password) {
      for (const user of users.values()) {
        if (user.email === email && user.password === password && !user.banned) return true;
      }
      return false;
    },
    async signOutCurrent() {
      fake.current = null;
    },
  };
  return fake;
}
