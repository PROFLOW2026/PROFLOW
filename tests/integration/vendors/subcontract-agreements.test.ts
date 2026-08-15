import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import {
  addApprovedSubcontractChange,
  changeSubcontractStatus,
  createSubcontract,
  createVendor,
  getSubcontractById,
  listVendorSubcontracts,
} from '@/modules/vendors';
import { AuthorizationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
}

describe('subcontract agreements', () => {
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

  it('records original event on create and approved change updates current only via events', async () => {
    const tenant = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');

    const created = await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
      const { projectId } = await createProject(context, { name: 'Tower A' });
      const subcontract = await createSubcontract(context, {
        title: 'Electrical package',
        vendorId: vendor.id,
        projectId,
        originalAmount: '100000',
      });
      await changeSubcontractStatus(context, {
        subcontractId: subcontract.id,
        status: 'active',
      });
      await addApprovedSubcontractChange(context, {
        subcontractId: subcontract.id,
        kind: 'change_order',
        direction: 'addition',
        amount: '15000',
      });
      return getSubcontractById(context, subcontract.id);
    });

    expect(created.originalAmountDerived).toBe(money('100000', created.currency).amount);
    expect(created.currentAmount).toBe(money('115000', created.currency).amount);
    expect(created.events.filter((event) => event.kind === 'original')).toHaveLength(1);
    expect(created.events.filter((event) => event.kind === 'change_order')).toHaveLength(1);
    expect(created.events.find((event) => event.kind === 'original')?.amount).toBe(
      money('100000', created.currency).amount,
    );
    expect(created.status).toBe('active');
  });

  it('rejects UPDATE of value events via append-only trigger', async () => {
    const tenant = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
        const { projectId } = await createProject(context, { name: 'Tower A' });
        const subcontract = await createSubcontract(context, {
          title: 'Electrical package',
          vendorId: vendor.id,
          projectId,
          originalAmount: '80000',
        });
        const original = subcontract.events.find((event) => event.kind === 'original');
        if (!original) throw new Error('missing original event');
        await tx.execute(
          sql`UPDATE subcontract_value_events SET amount = '1' WHERE id = ${original.id}::uuid`,
        );
      }),
    ).rejects.toSatisfy((error) => /append-only|integrity_constraint/i.test(errorBlob(error)));
  });

  it('prevents organization B from reading organization A subcontracts', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const subcontractId = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Alpha Sub' });
      const { projectId } = await createProject(context, { name: 'Alpha Site' });
      const subcontract = await createSubcontract(context, {
        title: 'Secret package',
        vendorId: vendor.id,
        projectId,
        originalAmount: '50000',
      });
      return subcontract.id;
    });

    await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });
      const list = await listVendorSubcontracts(
        context,
        (
          await createVendor(context, { name: 'Beta Vendor' })
        ).id,
      );
      expect(list).toHaveLength(0);
      await expect(getSubcontractById(context, subcontractId)).rejects.toThrow();
    });
  });

  it('prevents cross-tenant subcontract create without membership', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    await expect(
      database.asUser(orgB.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgB.owner.id,
          organizationId: orgA.organizationId,
          locale: 'en',
        });
        return createVendor(context, { name: 'Intruder' });
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
