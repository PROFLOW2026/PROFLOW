import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  createSubcontract,
  createVendor,
  getSubcontractById,
  getVendorById,
} from '@/modules/vendors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../projects/setup';

describe('subcontract vendor type guards (application entry points)', () => {
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

  async function seedProject(userId: string, organizationId: string) {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
      const { projectId } = await createProject(context, { name: 'Subcontract Site' });
      return projectId;
    });
  }

  it('allows subcontractor vendors without promotion', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const projectId = await seedProject(userA.id, orgA.organization.id);

    const subcontractId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Trade Sub', type: 'subcontractor' });
      const subcontract = await createSubcontract(context, {
        title: 'Envelope package',
        vendorId: vendor.id,
        projectId,
        originalAmount: '75000',
      });
      return subcontract.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const detail = await getSubcontractById(context, subcontractId);
      expect(detail.status).toBe('draft');
    });
  });

  it('rejects supplier vendors unless promoteVendorToBoth is confirmed', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const projectId = await seedProject(userA.id, orgA.organization.id);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Materials Supplier', type: 'supplier' });
        await createSubcontract(context, {
          title: 'Silent promote attempt',
          vendorId: vendor.id,
          projectId,
          originalAmount: '12000',
        });
      }),
    ).rejects.toMatchObject({
      messageKey: 'vendors.subcontracts.errors.supplierNeedsPromote',
    });
  });

  it('promotes supplier to both when promoteVendorToBoth is true', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const projectId = await seedProject(userA.id, orgA.organization.id);

    const vendorId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Dual Role Supplier', type: 'supplier' });
      await createSubcontract(context, {
        title: 'Confirmed promote',
        vendorId: vendor.id,
        projectId,
        originalAmount: '45000',
        promoteVendorToBoth: true,
      });
      return vendor.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await getVendorById(context, vendorId);
      expect(vendor?.type).toBe('both');

      const [row] = await tx
        .select({ type: vendors.type })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);
      expect(row?.type).toBe('both');
    });
  });

  it('rejects vendor type other at subcontract create', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const projectId = await seedProject(userA.id, orgA.organization.id);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const vendor = await createVendor(context, { name: 'Misc Vendor', type: 'other' });
        await createSubcontract(context, {
          title: 'Should fail',
          vendorId: vendor.id,
          projectId,
          originalAmount: '1000',
          promoteVendorToBoth: true,
        });
      }),
    ).rejects.toMatchObject({
      messageKey: 'vendors.subcontracts.errors.vendorTypeOther',
    });
  });
});
