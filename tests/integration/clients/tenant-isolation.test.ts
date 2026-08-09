import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizationModulePreferences } from '@drizzle/schema';
import { createClient, getClientById, listClientsForOrg } from '@/modules/clients';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('clients tenant isolation', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('prevents org B from reading org A client', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const clientId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Cohen Ltd' });
      return client.id;
    });

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        await getClientById(context, clientId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('notes module usage on first client create', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await createClient(context, { name: 'First Client' });
    });

    const prefs = await database.asService(async (db) =>
      db
        .select()
        .from(organizationModulePreferences)
        .where(eq(organizationModulePreferences.organizationId, orgA.organization.id)),
    );

    const clientsPref = prefs.find((pref) => pref.moduleKey === 'clients');
    expect(clientsPref?.firstUsedAt).not.toBeNull();
  });

  it('lists only clients in the active organization', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await createClient(context, { name: 'Alpha Client' });
    });

    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      await createClient(context, { name: 'Beta Client' });
    });

    const alphaClients = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listClientsForOrg(context);
    });

    expect(alphaClients).toHaveLength(1);
    expect(alphaClients[0]?.name).toBe('Alpha Client');
  });

  it('denies access when user is not a member of the organization', async () => {
    const { orgB, userA } = await provisionTwoTenants(database);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return listClientsForOrg(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
