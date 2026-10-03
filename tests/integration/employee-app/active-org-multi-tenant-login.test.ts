import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbClient from '@/shared/db/client';
import type { TestDatabase } from '../../setup/database';

vi.mock('server-only', () => ({}));

const { testDbHolder } = vi.hoisted(() => ({
  testDbHolder: { db: null as TestDatabase | null },
}));

vi.mock('@/shared/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof DbClient>();
  return {
    ...actual,
    getAdminDb: () => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.db;
    },
  };
});

const signInWithPassword = vi.fn(async (input: { password?: string }) => {
  if (input.password?.includes('bad-pin-marker')) {
    return {
      data: { user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    };
  }
  return { data: { user: { id: 'mock' } }, error: null };
});

vi.mock('@/shared/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: (input: { password?: string }) => signInWithPassword(input) },
  }),
  getSupabaseUser: async () => null,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInWithPassword: (input: { password?: string }) => signInWithPassword(input) },
  }),
}));

import { and, eq } from 'drizzle-orm';
import { employeeAppAccounts } from '@drizzle/schema';
import { createEmployee } from '@/modules/workforce/application/employees';
import { insertEmployeeAppAccount } from '@/modules/employee-app/data/accounts.repository';
import { employeeLogin } from '@/modules/employee-app/application/employee-login';
import {
  getActiveOrganizationPreference,
  setActiveOrganizationPreference,
} from '@/modules/identity';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProject, listProjectsForOrg } from '@/modules/projects';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase } from '../../setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

describe('employee login active organization (multi-org integration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-employee-auth';
    database = await createTestDatabase();
    testDbHolder.db = database;
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    signInWithPassword.mockClear();
    await database.reset();
  });

  async function provisionDualOrgEmployee() {
    await seedSystem(database);
    const user = await createTestUser(database, 'dual-org@example.test');
    const orgA = await createTestOrganization(database, user, 'Org Alpha Employee');
    const orgB = await createTestOrganization(database, user, 'Org Beta Owner');

    await database.asUser(user.id, async (tx) => {
      await setActiveOrganizationPreference(tx, user.id, orgB.organization.id);
    });

    const username = 'worker2485';
    let employeeId = '';

    await database.asUser(user.id, async (tx) => {
      const ctxA = await resolveOrgContext(tx, {
        userId: user.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const employee = await createEmployee(ctxA, { name: 'Field Worker', rateUnit: 'hourly' });
      employeeId = employee.id;
      await insertEmployeeAppAccount(tx, {
        organizationId: orgA.organization.id,
        employeeId: employee.id,
        userId: user.id,
        username,
        usernameNormalized: username,
        authEmail: `employee-${employee.id}@employee.local`,
        status: 'active',
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        createdByUserId: user.id,
      });
      await createProject(ctxA, { name: 'Org A Project Only' });
    });

    return { user, orgA, orgB, employeeId, username, pin: '123456' };
  }

  it('after employee login, preferred org switches from B to employee org A', async () => {
    const { user, orgA, orgB, username, pin } = await provisionDualOrgEmployee();

    const prefBefore = await database.asUser(user.id, async (tx) =>
      getActiveOrganizationPreference(tx, user.id),
    );
    expect(prefBefore).toBe(orgB.organization.id);

    const result = await employeeLogin({ username, pin });
    expect(result.organizationId).toBe(orgA.organization.id);

    await database.asUser(user.id, async (tx) => {
      await setActiveOrganizationPreference(tx, user.id, result.organizationId);
    });

    const prefAfter = await database.asUser(user.id, async (tx) =>
      getActiveOrganizationPreference(tx, user.id),
    );
    expect(prefAfter).toBe(orgA.organization.id);
  });

  it('employee org context lists only Org A projects (not Org B)', async () => {
    const { user, orgA, orgB } = await provisionDualOrgEmployee();

    await database.asUser(user.id, async (tx) => {
      const ctxB = await resolveOrgContext(tx, {
        userId: user.id,
        organizationId: orgB.organization.id,
        locale: 'he-IL',
      });
      await createProject(ctxB, { name: 'Org B Secret Project' });
    });

    await database.asUser(user.id, async (tx) => {
      await setActiveOrganizationPreference(tx, user.id, orgA.organization.id);
      const ctxA = await resolveOrgContext(tx, {
        userId: user.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const projects = await listProjectsForOrg(ctxA, {});
      expect(projects.every((p) => p.name !== 'Org B Secret Project')).toBe(true);
      expect(projects.some((p) => p.name === 'Org A Project Only')).toBe(true);
    });
  });

  it('invalid PIN fails without changing preferred org', async () => {
    const { user, orgB, username } = await provisionDualOrgEmployee();
    signInWithPassword.mockImplementationOnce(async () => ({
      data: { user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    }));
    await expect(employeeLogin({ username, pin: '654321' })).rejects.toBeInstanceOf(DomainRuleError);
    const pref = await database.asUser(user.id, async (tx) =>
      getActiveOrganizationPreference(tx, user.id),
    );
    expect(pref).toBe(orgB.organization.id);
  });

  it('locked account rejects login', async () => {
    const { orgA, username, pin, employeeId } = await provisionDualOrgEmployee();
    await database.asService(async (db) => {
      await db
        .update(employeeAppAccounts)
        .set({ lockedUntil: new Date(Date.now() + 60_000) })
        .where(
          and(
            eq(employeeAppAccounts.organizationId, orgA.organization.id),
            eq(employeeAppAccounts.employeeId, employeeId),
          ),
        );
    });
    await expect(employeeLogin({ username, pin })).rejects.toBeInstanceOf(DomainRuleError);
  });
});
