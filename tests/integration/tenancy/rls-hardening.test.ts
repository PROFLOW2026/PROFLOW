import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { roles } from '@drizzle/schema';
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  resolveOrgContext,
} from '@/modules/tenancy';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

async function onboardWorker(
  database: TestDatabase,
  ownerId: string,
  organizationId: string,
  workerEmail: string,
) {
  const invitation = await database.asUser(ownerId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId: ownerId, organizationId, locale: 'en' });
    return createInvitation(context, { email: workerEmail, roleKey: 'worker' });
  });

  const worker = await createTestUser(database, workerEmail);
  await database.asService((db) =>
    acceptInvitation(db, {
      token: invitation.token,
      userId: worker.id,
      userEmail: worker.email,
    }),
  );

  return worker;
}

/**
 * LOW-16: authorization tables and organization updates require the matching
 * permission at the database layer, not merely active membership.
 */
describe('authorization table RLS hardening', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('still lets a founder provision roles before any assignment exists', async () => {
    const founder = await createTestUser(database, 'founder-rls@example.test');

    await expect(
      database.asUser(founder.id, async (tx) =>
        createOrganization(tx, founder.id, { name: 'RLS Founding Test', countryCode: 'IL' }),
      ),
    ).resolves.toBeDefined();
  });

  it('denies a worker direct inserts into roles', async () => {
    const owner = await createTestUser(database, 'owner-rls@example.test');
    const workerEmail = 'worker-rls@example.test';

    const organizationId = await database.asUser(owner.id, async (tx) => {
      const created = await createOrganization(tx, owner.id, { name: 'RLS Worker Test', countryCode: 'IL' });
      return created.organization.id;
    });

    const worker = await onboardWorker(database, owner.id, organizationId, workerEmail);

    await database.asUser(worker.id, async (tx) => {
      await expect(
        tx.insert(roles).values({
          organizationId,
          key: 'custom',
          templateKey: null,
          name: 'Custom',
          description: 'Should not land',
          rank: 99,
          isProtected: false,
        }),
      ).rejects.toThrow();
    });
  });

  it('denies organization updates to members without org.update', async () => {
    const owner = await createTestUser(database, 'owner-update@example.test');
    const workerEmail = 'worker-update@example.test';

    const organizationId = await database.asUser(owner.id, async (tx) => {
      const created = await createOrganization(tx, owner.id, {
        name: 'RLS Update Test',
        countryCode: 'IL',
      });
      return created.organization.id;
    });

    const worker = await onboardWorker(database, owner.id, organizationId, workerEmail);

    await database.asUser(worker.id, async (tx) => {
      await tx.execute(sql`
        update organizations
        set name = 'Hijacked'
        where id = ${organizationId}::uuid
      `);
    });

    const rows = await database.asService(async (db) =>
      resultRows<{ name: string }>(
        await db.execute(sql`select name from organizations where id = ${organizationId}::uuid`),
      ),
    );

    expect(rows[0]?.name).toBe('RLS Update Test');
  });
});

describe('audit_events insert policy', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('rejects audit rows with a null organization_id', async () => {
    const member = await createTestUser(database, 'audit-null@example.test');

    await database.asUser(member.id, async (tx) => {
      await createOrganization(tx, member.id, { name: 'Audit Org', countryCode: 'IL' });
    });

    await expect(
      database.asUser(member.id, async (tx) =>
        tx.execute(sql`
          insert into audit_events (organization_id, actor_user_id, action, entity_type)
          values (null, ${member.id}::uuid, 'organization.created', 'organization')
        `),
      ),
    ).rejects.toThrow();
  });

  it('still accepts founding audit rows scoped to the new organization', async () => {
    const founder = await createTestUser(database, 'audit-founder@example.test');

    await database.asUser(founder.id, async (tx) =>
      createOrganization(tx, founder.id, { name: 'Audit Founding', countryCode: 'IL' }),
    );

    const rows = resultRows<{ count: string }>(
      await database.db.execute(sql`
        select count(*)::text as count
        from audit_events
        where action = 'organization.created'
      `),
    );
    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});
