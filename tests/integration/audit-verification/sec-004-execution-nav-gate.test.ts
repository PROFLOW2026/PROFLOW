/**
 * SEC-004 — execution workspace visibility at application boundary (no browser).
 * AUDIT ONLY.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/modules/projects';
import { updateDeliveryProfile } from '@/modules/project-profile';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

describe('audit SEC-004: execution nav profile gate (EXEC)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    owner = await createTestUser(database);
    const org = await database.asUser(owner.id, async (tx) =>
      createOrganization(tx, owner.id, { name: 'SEC-004 Org', countryCode: 'IL' }),
    );
    orgId = org.organization.id;
  });

  it('hides execution nav group when delivery profile is not developer_gc', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const project = await createProject(context, { name: 'Plain project' });
      await updateDeliveryProfile(context, {
        projectId: project.projectId,
        operatingRoles: ['project_management'],
      });
      const nav = await loadProjectExecutionNav(context, project.projectId);
      expect(nav.showGroup).toBe(false);
      expect(nav.links).toHaveLength(0);
    });
  });

  it('shows execution nav hubs when profile is developer + general_contractor', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'he-IL',
      });
      const project = await createProject(context, { name: 'GC project' });
      await updateDeliveryProfile(context, {
        projectId: project.projectId,
        operatingRoles: ['developer', 'general_contractor'],
      });
      const nav = await loadProjectExecutionNav(context, project.projectId);
      expect(nav.showGroup).toBe(true);
      expect(nav.links.length).toBeGreaterThan(0);
    });
  });
});
