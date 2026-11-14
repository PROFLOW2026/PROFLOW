import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { createProjectAs, createContractor } from '../../setup/dg-fixtures';
import { EXTERNAL_CAPABILITIES } from '@/shared/external/capabilities';

describe('contractor external scopes (0205 whitelist)', () => {
  it('accepts ext.takeoff.view and rejects unknown ext scopes', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database);
    const { organization } = await createTestOrganization(database, owner, 'Scope Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Scope Project');

    await database.asService(async (db) => {
      const ok = await db.execute(
        sql`select app.external_scopes_valid(${JSON.stringify([EXTERNAL_CAPABILITIES.TAKEOFF_VIEW])}::jsonb) as valid`,
      );
      const okRows = Array.isArray(ok) ? ok : ((ok as { rows: { valid: boolean }[] }).rows ?? []);
      expect(okRows[0]?.valid).toBe(true);

      const bad = await db.execute(sql`select app.external_scopes_valid(${JSON.stringify(['ext.nope.view'])}::jsonb) as valid`);
      const badRows = Array.isArray(bad) ? bad : ((bad as { rows: { valid: boolean }[] }).rows ?? []);
      expect(badRows[0]?.valid).toBe(false);
    });

    const contractor = await createContractor(database, {
      organizationId: organization.id,
      projectId,
      label: 'takeoff-contractor',
      capabilities: [EXTERNAL_CAPABILITIES.TAKEOFF_VIEW, EXTERNAL_CAPABILITIES.TAKEOFF_MANAGE, EXTERNAL_CAPABILITIES.TAKEOFF_LIBRARY_MANAGE],
    });
    expect(contractor.grantId).toBeTruthy();
  });
});