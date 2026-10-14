import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { listAccessibleProjectIdsForUser } from '@/modules/projects/data/project-access.repository';
import { getStoredProjectAccessMode } from '@/modules/projects/data/project-access.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import { applyPreparedMigrations, GATE_A_PG_LITE_SCHEMA_PARITY } from '@tests/setup/pending-journal-migrations';

describe('K07 accessible project ids parity with can_access_project', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_PG_LITE_SCHEMA_PARITY);
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  it('includes project_members in selected mode and excludes assignment-only projects', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'access-owner@example.test');
    const memberUser = await createTestUser(database, 'access-member@example.test');
    const assigneeUser = await createTestUser(database, 'access-assignee@example.test');
    const org = await database.asService((db) =>
      createOrganization(db, owner.id, { name: 'Access Org', countryCode: 'IL' }),
    );

    const { memberProjectId, assignmentProjectId } = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      const memberProject = await createProject(context, { name: 'Member project' });
      const assignmentProject = await createProject(context, { name: 'Assignment project' });
      return { memberProjectId: memberProject.projectId, assignmentProjectId: assignmentProject.projectId };
    });

    await database.asService(async (db) => {
      await db.execute(sql`
        update organization_settings
        set value = '"selected"'
        where organization_id = ${org.organization.id}::uuid
          and key = 'project_access_mode'
      `);
      await db.execute(sql`
        insert into organization_memberships (organization_id, user_id, status)
        values
          (${org.organization.id}::uuid, ${memberUser.id}::uuid, 'active'),
          (${org.organization.id}::uuid, ${assigneeUser.id}::uuid, 'active')
        on conflict do nothing
      `);
      await db.execute(sql`
        insert into project_members (organization_id, project_id, user_id, status, title)
        values (${org.organization.id}::uuid, ${memberProjectId}::uuid, ${memberUser.id}::uuid, 'active', 'consultant')
      `);
      const employeeResult = await db.execute(sql`
        insert into employees (organization_id, user_id, status, name)
        values (${org.organization.id}::uuid, ${assigneeUser.id}::uuid, 'active', 'Assignee')
        returning id
      `);
      const employeeRows = Array.isArray(employeeResult)
        ? employeeResult
        : ((employeeResult as { rows: { id: string }[] }).rows ?? []);
      const employeeId = employeeRows[0]?.id;
      await db.execute(sql`
        insert into employee_project_assignments (organization_id, project_id, employee_id, status, start_date)
        values (${org.organization.id}::uuid, ${assignmentProjectId}::uuid, ${employeeId}::uuid, 'active', '2026-01-01')
      `);
    });

    const mode = await database.asService((db) => getStoredProjectAccessMode(db, org.organization.id));
    expect(mode).toBe('selected');

    const memberIds = await database.asService((db) =>
      listAccessibleProjectIdsForUser(db, org.organization.id, memberUser.id, 'selected'),
    );
    expect(memberIds).toContain(memberProjectId);

    const assigneeIds = await database.asService((db) =>
      listAccessibleProjectIdsForUser(db, org.organization.id, assigneeUser.id, 'selected'),
    );
    expect(assigneeIds).not.toContain(assignmentProjectId);
  });
});
