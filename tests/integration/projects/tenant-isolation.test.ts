import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProject, getProjectDetail, listProjectsForOrg } from '@/modules/projects';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('projects tenant isolation', () => {
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

  it('prevents org B from reading org A project', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const projectId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const result = await createProject(context, { name: 'Secret Tower' });
      return result.projectId;
    });

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        await getProjectDetail(context, projectId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates a default work package internally on project create', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const detail = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Simple Job' });
      return getProjectDetail(context, projectId);
    });

    expect(detail.workPackages).toHaveLength(1);
    expect(detail.workPackages[0]?.isDefault).toBe(true);
    expect(detail.showWorkPackages).toBe(false);
  });

  it('lists only projects in the active organization', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await createProject(context, { name: 'Alpha Job' });
    });

    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      await createProject(context, { name: 'Beta Job' });
    });

    const alphaProjects = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listProjectsForOrg(context);
    });

    expect(alphaProjects).toHaveLength(1);
    expect(alphaProjects[0]?.name).toBe('Alpha Job');
  });

  it('denies cross-tenant list via authorization when context is wrong org', async () => {
    const { orgA, orgB, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await createProject(context, { name: 'Alpha Job' });
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return listProjectsForOrg(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
