import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { safetyRecordContractorLinks } from '@drizzle/schema';
import { listContractorSafetyForPortal, reportSafetyFromPortal } from '@/modules/safety/contractor';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { asExternal, complianceScenario } from '@tests/setup/dg-fixtures-compliance';

describe('Track P - contractor site safety isolation', () => {
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

  it('isolates contractor A safety reports from contractor B', async () => {
    const s = await complianceScenario(database);
    const { safetyRecordId } = await asExternal(database, s.contractorA, s.orgId, (context) =>
      reportSafetyFromPortal(context, {
        organizationId: s.orgId,
        projectId: s.projectId,
        recordType: 'hazard',
        title: 'Unsecured opening',
        description: 'Floor opening without guardrail on level 3.',
        occurredAt: new Date('2026-10-01T10:00:00Z'),
      }),
    );

    const listA = await asExternal(database, s.contractorA, s.orgId, (context) =>
      listContractorSafetyForPortal(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(listA.map((row) => row.id)).toEqual([safetyRecordId]);

    const listB = await asExternal(database, s.contractorB, s.orgId, (context) =>
      listContractorSafetyForPortal(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(listB).toEqual([]);

    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      expect(
        await tx.select().from(safetyRecordContractorLinks).where(eq(safetyRecordContractorLinks.safetyRecordId, safetyRecordId)),
      ).toHaveLength(0);
    });
  });
});
