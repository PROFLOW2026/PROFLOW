import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { deliveryItems } from '@drizzle/schema';
import {
  createProjectDelivery,
  getDeliveryForPortal,
  listDeliveriesForPortal,
  reportDeliveryFromPortal,
} from '@/modules/deliveries';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { asExternal, asInternal, complianceScenario } from '@tests/setup/dg-fixtures-compliance';

describe('Track P - deliveries contractor isolation', () => {
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

  it('isolates contractor A deliveries from contractor B (list, portal detail, reports)', async () => {
    const s = await complianceScenario(database);
    const created = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      createProjectDelivery(context, {
        projectId: s.projectId,
        vendorId: s.contractorA.vendorId,
        agreementId: s.contractorA.agreementId!,
        itemName: 'Tower crane segment',
        expectedDate: '2026-11-01',
        contractorVisible: true,
      }),
    );

    const listA = await asExternal(database, s.contractorA, s.orgId, (context) =>
      listDeliveriesForPortal(context, { organizationId: s.orgId, projectId: s.projectId, today: '2026-10-01' }),
    );
    expect(listA.items.map((row) => row.id)).toEqual([created.id]);

    const listB = await asExternal(database, s.contractorB, s.orgId, (context) =>
      listDeliveriesForPortal(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(listB.items).toEqual([]);

    await expect(
      asExternal(database, s.contractorB, s.orgId, (context) =>
        getDeliveryForPortal(context, {
          organizationId: s.orgId,
          projectId: s.projectId,
          deliveryItemId: created.id,
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      asExternal(database, s.contractorB, s.orgId, (context) =>
        reportDeliveryFromPortal(context, {
          organizationId: s.orgId,
          projectId: s.projectId,
          deliveryItemId: created.id,
          reportKind: 'delay_notice',
          newExpectedDate: '2026-11-15',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      expect(await tx.select().from(deliveryItems).where(eq(deliveryItems.id, created.id))).toHaveLength(0);
    });
  });
});
