import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  organizationMemberships,
  organizationSettings,
  profiles,
  projectAccessGrants,
  projects,
  roleAssignments,
  rolePermissions,
  roles,
} from '@drizzle/schema';
import { AUTOMATION_PRESET_KEYS } from '@/modules/automations/domain/types';
import { provisionOrganizationRoles } from '@/modules/rbac';
import { seedSystemData } from '@drizzle/seed/system';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('UWM 0096–0112 access + integrity (disposable PGlite)', () => {
  let database: TestDatabase;
  let orgId: string;
  let otherOrgId: string;
  let ownerId: string;
  let ownerMembershipId: string;
  let scopedUserId: string;
  let scopedMembershipId: string;
  let projectAId: string;
  let projectBId: string;
  let otherOrgProjectId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    otherOrgId = randomUUID();
    ownerId = randomUUID();
    scopedUserId = randomUUID();
    ownerMembershipId = randomUUID();
    scopedMembershipId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();
    otherOrgProjectId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values([
        { id: ownerId, email: 'uwm-owner@example.test', displayName: 'Owner' },
        { id: scopedUserId, email: 'uwm-scoped@example.test', displayName: 'Scoped' },
      ]);

      await db.execute(sql`
        INSERT INTO organizations (id, name, base_currency, timezone, country_code, default_locale)
        VALUES
          (${orgId}::uuid, 'UWM Org', 'ILS', 'Asia/Jerusalem', 'IL', 'he-IL'),
          (${otherOrgId}::uuid, 'Other Org', 'ILS', 'Asia/Jerusalem', 'IL', 'he-IL')
      `);

      await db.insert(organizationMemberships).values([
        {
          id: ownerMembershipId,
          organizationId: orgId,
          userId: ownerId,
          status: 'active',
        },
        {
          id: scopedMembershipId,
          organizationId: orgId,
          userId: scopedUserId,
          status: 'active',
        },
      ]);

      const orgRoles = await provisionOrganizationRoles(db, orgId);
      await db.execute(sql`
        INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
        VALUES (${orgId}::uuid, ${ownerMembershipId}::uuid, ${ownerId}::uuid, ${orgRoles.owner}::uuid)
      `);

      const scopedRoleId = randomUUID();
      await db.insert(roles).values({
        id: scopedRoleId,
        organizationId: orgId,
        key: 'uwm_scoped',
        name: 'UWM Scoped',
        rank: 50,
        isProtected: false,
      });
      for (const key of ['tasks.read', 'projects.read']) {
        await db.insert(rolePermissions).values({
          organizationId: orgId,
          roleId: scopedRoleId,
          permissionKey: key,
        });
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId: scopedMembershipId,
        userId: scopedUserId,
        roleId: scopedRoleId,
      });

      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: 'selected',
      });

      await db.insert(projects).values([
        {
          id: projectAId,
          organizationId: orgId,
          name: 'Project A',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: projectBId,
          organizationId: orgId,
          name: 'Project B',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: otherOrgProjectId,
          organizationId: otherOrgId,
          name: 'Foreign Project',
          status: 'active',
          currency: 'ILS',
        },
      ]);

      await db.insert(projectAccessGrants).values({
        organizationId: orgId,
        userId: scopedUserId,
        projectId: projectAId,
        accessLevel: 'read',
      });
    });
  });

  async function insertWorkspace(
    visibility: 'organization' | 'restricted' | 'team',
    workspaceType: 'project_linked' | 'org_internal' = 'project_linked',
  ) {
    return database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO workspaces (
            organization_id, name, workspace_type, workspace_visibility
          ) VALUES (
            ${orgId}::uuid, ${`WS-${visibility}`}, ${workspaceType}::workspace_type,
            ${visibility}::workspace_visibility
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
  }

  async function linkProjects(workspaceId: string, projectIds: string[]) {
    await database.asService(async (db) => {
      for (const projectId of projectIds) {
        await db.execute(sql`
          INSERT INTO project_workspace_links (workspace_id, project_id)
          VALUES (${workspaceId}::uuid, ${projectId}::uuid)
        `);
      }
    });
  }

  async function insertTask(
    workspaceId: string,
    projectId: string | null,
    title: string,
  ) {
    return database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title,
            created_by_org_member_id, created_by_system
          ) VALUES (
            ${orgId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${title},
            ${ownerMembershipId}::uuid, false
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });
  }

  it('rejects cross-org project_workspace_links', async () => {
    const wsId = await insertWorkspace('organization');
    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO project_workspace_links (workspace_id, project_id)
          VALUES (${wsId}::uuid, ${otherOrgProjectId}::uuid)
        `);
      }),
    ).rejects.toThrow(/same organization|project_workspace_links/i);
  });

  it('rejects task with unlinked project context and allows NULL workspace-wide context', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    await expect(
      insertTask(wsId, projectBId, 'orphan project context'),
    ).rejects.toThrow(/foreign key|23503|project_workspace_context|Failed query/i);

    const wideTaskId = await insertTask(wsId, null, 'workspace-wide');
    expect(wideTaskId).toBeTruthy();
  });

  it('isolates restricted org-internal workspace from non-members', async () => {
    const wsId = await insertWorkspace('restricted', 'org_internal');
    await insertTask(wsId, null, 'internal wide task');

    const visible = await database.asUser(scopedUserId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM workspaces WHERE id = ${wsId}::uuid
        `),
      ),
    );
    expect(visible).toHaveLength(0);
  });

  it('shared workspace: Project A grant does not expose Project B or workspace-wide tasks', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId, projectBId]);
    await insertTask(wsId, projectAId, 'Task A');
    await insertTask(wsId, projectBId, 'Task B');
    await insertTask(wsId, null, 'Workspace wide');

    const rows = await database.asUser(scopedUserId, async (tx) =>
      resultRows<{ title: string }>(
        await tx.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(rows.map((r) => r.title)).toEqual(['Task A']);
  });

  it('rejects duplicate task per recurrence occurrence', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const templateTaskId = await insertTask(wsId, projectAId, 'template');

    const ruleId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_recurrence_rules (
            organization_id, rrule, starts_at, template_task_id
          ) VALUES (
            ${orgId}::uuid, 'FREQ=DAILY', now(), ${templateTaskId}::uuid
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const occurrenceId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_recurrence_occurrences (
            rule_id, organization_id, occurrence_at, status
          ) VALUES (
            ${ruleId}::uuid, ${orgId}::uuid, '2026-09-01T09:00:00Z', 'pending'
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await insertTask(wsId, projectAId, 'generated once');
    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE tasks
        SET generated_from_occurrence_id = ${occurrenceId}::uuid
        WHERE title = 'generated once'
      `);
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title,
            created_by_system, generated_from_occurrence_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'duplicate gen',
            true, ${occurrenceId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/unique|23505|generated_from_occurrence/i);
  });

  it('automation_rules CHECK accepts exact UWM AUTOMATION_PRESET_KEYS and rejects legacy *_notify names', async () => {
    const uwmKeys = AUTOMATION_PRESET_KEYS.filter((k) => k.startsWith('task_') || k === 'project_created');

    await database.asService(async (db) => {
      for (const presetKey of uwmKeys) {
        await db.execute(sql`
          INSERT INTO automation_rules (organization_id, preset_key, enabled, config_json)
          VALUES (${orgId}::uuid, ${presetKey}, false, '{}'::jsonb)
        `);
      }
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO automation_rules (organization_id, preset_key, enabled, config_json)
          VALUES (${orgId}::uuid, 'task_overdue_notify', false, '{}'::jsonb)
        `);
      }),
    ).rejects.toThrow(/check|23514|automation_rules_preset_known|Failed query/i);
  });

  it('meeting in restricted workspace is invisible to non-members', async () => {
    const wsId = await insertWorkspace('restricted');
    await linkProjects(wsId, [projectAId]);

    const meetingId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO meeting_records (
            organization_id, workspace_id, project_id, title, scheduled_at
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid,
            'Restricted standup', now()
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const visible = await database.asUser(scopedUserId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM meeting_records WHERE id = ${meetingId}::uuid
        `),
      ),
    );
    expect(visible).toHaveLength(0);
  });

  async function addWorkspaceMember(
    workspaceId: string,
    membershipId: string,
    accessLevel: 'viewer' | 'contributor' | 'manager',
  ) {
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO workspace_members (
          workspace_id, organization_id, org_member_id, access_level
        ) VALUES (
          ${workspaceId}::uuid, ${orgId}::uuid, ${membershipId}::uuid,
          ${accessLevel}::workspace_member_access_level
        )
      `);
    });
  }

  async function createEmployeeWithGrants(
    label: string,
    grants: Array<{ permissionKey: string; scope: string }>,
    options: {
      projectIds?: string[];
      projectAssignments?: Array<{
        projectId: string;
        startDate: string;
        endDate?: string | null;
      }>;
    } = {},
  ) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const employeeId = randomUUID();
    const accountId = randomUUID();
    const assignments =
      options.projectAssignments ??
      (options.projectIds ?? []).map((projectId) => ({
        projectId,
        startDate: '2026-01-01',
        endDate: null as string | null,
      }));

    await database.asService(async (db) => {
      await db.insert(profiles).values({
        id: userId,
        email: `emp-${label}@example.test`,
        displayName: label,
      });
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });
      await db.execute(sql`
        INSERT INTO employees (id, organization_id, name, status, user_id)
        VALUES (${employeeId}::uuid, ${orgId}::uuid, ${label}, 'active', ${userId}::uuid)
      `);
      await db.execute(sql`
        INSERT INTO employee_app_accounts (
          id, organization_id, employee_id, user_id, status,
          username, username_normalized, auth_email
        ) VALUES (
          ${accountId}::uuid, ${orgId}::uuid, ${employeeId}::uuid, ${userId}::uuid, 'active',
          ${label}, ${label.toLowerCase()}, ${`emp-${label}@auth.example.test`}
        )
      `);
      for (const grant of grants) {
        await db.execute(sql`
          INSERT INTO employee_permission_grants (
            organization_id, employee_id, permission_key, scope, granted
          ) VALUES (
            ${orgId}::uuid, ${employeeId}::uuid, ${grant.permissionKey},
            ${grant.scope}::permission_scope, true
          )
        `);
      }
      for (const assignment of assignments) {
        await db.execute(sql`
          INSERT INTO employee_project_assignments (
            organization_id, project_id, employee_id, start_date, end_date, status
          ) VALUES (
            ${orgId}::uuid, ${assignment.projectId}::uuid, ${employeeId}::uuid,
            ${assignment.startDate}, ${assignment.endDate ?? null}, 'active'
          )
        `);
      }
    });

    return { userId, membershipId, employeeId };
  }

  async function linkUserToEmployee(
    userId: string,
    label: string,
    grants: Array<{ permissionKey: string; scope: string }> = [],
  ) {
    const employeeId = randomUUID();
    const accountId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO employees (id, organization_id, name, status, user_id)
        VALUES (${employeeId}::uuid, ${orgId}::uuid, ${label}, 'active', ${userId}::uuid)
      `);
      await db.execute(sql`
        INSERT INTO employee_app_accounts (
          id, organization_id, employee_id, user_id, status,
          username, username_normalized, auth_email
        ) VALUES (
          ${accountId}::uuid, ${orgId}::uuid, ${employeeId}::uuid, ${userId}::uuid, 'active',
          ${label}, ${label.toLowerCase()}, ${`linked-${label}@auth.example.test`}
        )
      `);
      for (const grant of grants) {
        await db.execute(sql`
          INSERT INTO employee_permission_grants (
            organization_id, employee_id, permission_key, scope, granted
          ) VALUES (
            ${orgId}::uuid, ${employeeId}::uuid, ${grant.permissionKey},
            ${grant.scope}::permission_scope, true
          )
        `);
      }
    });

    return { employeeId };
  }

  async function createMemberWithPermissions(
    label: string,
    permissionKeys: string[],
    projectGrantId?: string,
  ) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(profiles).values({
        id: userId,
        email: `uwm-${label}@example.test`,
        displayName: label,
      });
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });
      await db.insert(roles).values({
        id: roleId,
        organizationId: orgId,
        key: `uwm_${label}`,
        name: `UWM ${label}`,
        rank: 40,
        isProtected: false,
      });
      for (const permissionKey of permissionKeys) {
        await db.insert(rolePermissions).values({
          organizationId: orgId,
          roleId,
          permissionKey,
        });
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId,
        userId,
        roleId,
      });
      if (projectGrantId) {
        await db.insert(projectAccessGrants).values({
          organizationId: orgId,
          userId,
          projectId: projectGrantId,
          accessLevel: 'read',
        });
      }
    });

    return { userId, membershipId };
  }

  it('A: org member without tasks.read cannot SELECT tasks', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    await insertTask(wsId, projectAId, 'Hidden from no-read user');

    const { userId } = await createMemberWithPermissions('no-task-read', ['projects.read'], projectAId);

    const rows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM tasks`)),
    );
    expect(rows).toHaveLength(0);
  });

  it('B: tasks.read only can SELECT but not UPDATE/DELETE tasks', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Read-only task');

    const { userId } = await createMemberWithPermissions(
      'read-only',
      ['tasks.read', 'projects.read'],
      projectAId,
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(visible).toHaveLength(1);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated' WHERE id = ${taskId}::uuid
      `);
    });

    const afterUpdate = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`SELECT title FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(afterUpdate[0]?.title).toBe('Read-only task');

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`DELETE FROM tasks WHERE id = ${taskId}::uuid`);
    });

    const afterDelete = await database.asService(async (db) =>
      resultRows<{ id: string }>(
        await db.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(afterDelete).toHaveLength(1);
  });

  it('C: member without workspaces.manage cannot mutate workspace structure', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    const { userId, membershipId } = await createMemberWithPermissions(
      'no-ws-manage',
      ['tasks.read', 'projects.read'],
      projectAId,
    );

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO workspaces (
            organization_id, name, workspace_type, workspace_visibility
          ) VALUES (
            ${orgId}::uuid, 'Escalated WS', 'org_internal'::workspace_type,
            'organization'::workspace_visibility
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO workspace_members (
            workspace_id, organization_id, org_member_id, access_level
          ) VALUES (
            ${wsId}::uuid, ${orgId}::uuid, ${membershipId}::uuid, 'manager'::workspace_member_access_level
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    const boardId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_boards (organization_id, workspace_id, name)
          VALUES (${orgId}::uuid, ${wsId}::uuid, 'Main')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_buckets (organization_id, board_id, name, sort_key)
          VALUES (${orgId}::uuid, ${boardId}::uuid, 'New bucket', 'a')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('D: tasks.create can insert accessible tasks', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    const { userId, membershipId } = await createMemberWithPermissions(
      'task-creator',
      ['tasks.read', 'tasks.create', 'projects.read'],
      projectAId,
    );

    const created = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title,
            created_by_org_member_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Created by creator',
            ${membershipId}::uuid
          )
          RETURNING id
        `),
      ),
    );
    expect(created).toHaveLength(1);
  });

  it('E: without tasks.assign cannot mutate task_assignees', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Assign guarded');

    const { userId, membershipId } = await createMemberWithPermissions(
      'no-assign',
      ['tasks.read', 'projects.read'],
      projectAId,
    );

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_assignees (
            task_id, organization_id, org_member_id
          ) VALUES (
            ${taskId}::uuid, ${orgId}::uuid, ${membershipId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('F: without tasks.comment cannot insert task_comments', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Comment guarded');

    const { userId, membershipId } = await createMemberWithPermissions(
      'no-comment',
      ['tasks.read', 'projects.read'],
      projectAId,
    );

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_comments (
            task_id, organization_id, author_org_member_id, body
          ) VALUES (
            ${taskId}::uuid, ${orgId}::uuid, ${membershipId}::uuid, 'blocked'
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('G: meetings.read only can read but not mutate meetings', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    const meetingId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO meeting_records (
            organization_id, workspace_id, project_id, title, scheduled_at
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid,
            'Readable meeting', now()
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const { userId } = await createMemberWithPermissions(
      'meetings-read-only',
      ['meetings.read', 'projects.read'],
      projectAId,
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM meeting_records WHERE id = ${meetingId}::uuid
        `),
      ),
    );
    expect(visible).toHaveLength(1);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE meeting_records SET title = 'Mutated' WHERE id = ${meetingId}::uuid
      `);
    });

    const afterUpdate = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`
          SELECT title FROM meeting_records WHERE id = ${meetingId}::uuid
        `),
      ),
    );
    expect(afterUpdate[0]?.title).toBe('Readable meeting');
  });

  it('H: admin template/stage/label mutations require manage permissions', async () => {
    const { userId: stageUser } = await createMemberWithPermissions('no-stages', ['tasks.read']);
    const { userId: labelUser } = await createMemberWithPermissions('no-labels', ['tasks.read']);
    const { userId: taskTplUser } = await createMemberWithPermissions('no-task-tpl', ['tasks.read']);
    const { userId: projTplUser } = await createMemberWithPermissions('no-proj-tpl', ['tasks.read']);

    await expect(
      database.asUser(stageUser, async (tx) => {
        await tx.execute(sql`
          INSERT INTO project_stage_definitions (organization_id, name, position)
          VALUES (${orgId}::uuid, 'Blocked stage', 1)
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    await expect(
      database.asUser(labelUser, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_labels (organization_id, name)
          VALUES (${orgId}::uuid, 'Blocked label')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    await expect(
      database.asUser(taskTplUser, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_templates (organization_id, title)
          VALUES (${orgId}::uuid, 'Blocked task template')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    await expect(
      database.asUser(projTplUser, async (tx) => {
        await tx.execute(sql`
          INSERT INTO project_templates (organization_id, name)
          VALUES (${orgId}::uuid, 'Blocked project template')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    const { userId: stageManager } = await createMemberWithPermissions('stage-manager', [
      'stages.manage',
    ]);
    const stageRow = await database.asUser(stageManager, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_stage_definitions (organization_id, name, position)
          VALUES (${orgId}::uuid, 'Allowed stage', 2)
          RETURNING id
        `),
      ),
    );
    expect(stageRow).toHaveLength(1);
  });

  it('I: service_role trusted operations still pass', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO workspaces (
          organization_id, name, workspace_type, workspace_visibility
        ) VALUES (
          ${orgId}::uuid, 'Service WS', 'org_internal'::workspace_type,
          'organization'::workspace_visibility
        )
      `);
      await db.execute(sql`
        INSERT INTO tasks (
          organization_id, workspace_id, project_id, title, created_by_system
        ) VALUES (
          ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Service task', true
        )
      `);
    });
  });

  it('R4-1: employee project_manager (manage_all assigned_only) cannot access Project B', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId, projectBId]);
    const taskAId = await insertTask(wsId, projectAId, 'PM Task A');
    const taskBId = await insertTask(wsId, projectBId, 'PM Task B');

    const { userId } = await createEmployeeWithGrants(
      'project-manager',
      [
        { permissionKey: 'tasks.read', scope: 'assigned_only' },
        { permissionKey: 'tasks.manage_all', scope: 'assigned_only' },
      ],
      { projectIds: [projectAId] },
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY id
        `),
      ),
    );
    expect(visible.map((r) => r.id)).toEqual([taskAId]);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated A' WHERE id = ${taskAId}::uuid
      `);
    });
    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated B' WHERE id = ${taskBId}::uuid
      `);
    });

    const titles = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(titles.map((r) => r.title)).toEqual(['Mutated A', 'PM Task B']);
  });

  it('R4-2: employee read assigned_only + update self_only — read project task, update only when assigned', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Scope split task');

    const { userId, employeeId } = await createEmployeeWithGrants(
      'read-update-split',
      [
        { permissionKey: 'tasks.read', scope: 'assigned_only' },
        { permissionKey: 'tasks.update', scope: 'self_only' },
      ],
      { projectIds: [projectAId] },
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(visible).toHaveLength(1);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Blocked update' WHERE id = ${taskId}::uuid
      `);
    });

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO task_assignees (task_id, organization_id, employee_id)
        VALUES (${taskId}::uuid, ${orgId}::uuid, ${employeeId}::uuid)
      `);
    });

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Self assigned update' WHERE id = ${taskId}::uuid
      `);
    });

    const after = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`SELECT title FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(after[0]?.title).toBe('Self assigned update');
  });

  it('R4-3: all_organization employee cannot bypass restricted workspace visibility', async () => {
    const wsId = await insertWorkspace('restricted', 'org_internal');
    await insertTask(wsId, null, 'Restricted internal task');

    const { userId } = await createEmployeeWithGrants('all-org-emp', [
      { permissionKey: 'tasks.read', scope: 'all_organization' },
    ]);

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE workspace_id = ${wsId}::uuid`),
      ),
    );
    expect(visible).toHaveLength(0);
  });

  it('R4-4: viewer workspace member + tasks.create cannot INSERT', async () => {
    const wsId = await insertWorkspace('restricted');
    await linkProjects(wsId, [projectAId]);

    const { userId, membershipId } = await createMemberWithPermissions(
      'viewer-no-create',
      ['tasks.read', 'tasks.create', 'projects.read'],
      projectAId,
    );
    await addWorkspaceMember(wsId, membershipId, 'viewer');

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title, created_by_org_member_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Viewer blocked',
            ${membershipId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('R4-5: contributor workspace member + tasks.create can INSERT', async () => {
    const wsId = await insertWorkspace('restricted');
    await linkProjects(wsId, [projectAId]);

    const { userId, membershipId } = await createMemberWithPermissions(
      'contributor-create',
      ['tasks.read', 'tasks.create', 'projects.read'],
      projectAId,
    );
    await addWorkspaceMember(wsId, membershipId, 'contributor');

    const created = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title, created_by_org_member_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Contributor created',
            ${membershipId}::uuid
          )
          RETURNING id
        `),
      ),
    );
    expect(created).toHaveLength(1);
  });

  it('R4-6: viewer + tasks.assign cannot assign', async () => {
    const wsId = await insertWorkspace('restricted');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Assign viewer blocked');

    const { userId, membershipId } = await createMemberWithPermissions(
      'viewer-no-assign',
      ['tasks.read', 'tasks.assign', 'projects.read'],
      projectAId,
    );
    await addWorkspaceMember(wsId, membershipId, 'viewer');

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_assignees (task_id, organization_id, org_member_id)
          VALUES (${taskId}::uuid, ${orgId}::uuid, ${membershipId}::uuid)
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('R4-7: contributor + tasks.assign can assign', async () => {
    const wsId = await insertWorkspace('restricted');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Assign contributor ok');

    const { userId, membershipId } = await createMemberWithPermissions(
      'contributor-assign',
      ['tasks.read', 'tasks.assign', 'projects.read'],
      projectAId,
    );
    await addWorkspaceMember(wsId, membershipId, 'contributor');

    const assigned = await database.asUser(userId, async (tx) =>
      resultRows<{ task_id: string }>(
        await tx.execute(sql`
          INSERT INTO task_assignees (task_id, organization_id, org_member_id)
          VALUES (${taskId}::uuid, ${orgId}::uuid, ${membershipId}::uuid)
          RETURNING task_id
        `),
      ),
    );
    expect(assigned).toHaveLength(1);
  });

  it('R4-8: workspace is_read_only blocks mutations but allows SELECT', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Read-only WS task');

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE workspaces SET is_read_only = true WHERE id = ${wsId}::uuid
      `);
    });

    const { userId, membershipId } = await createMemberWithPermissions(
      'read-only-ws',
      ['tasks.read', 'tasks.update', 'tasks.create', 'projects.read'],
      projectAId,
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(visible).toHaveLength(1);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Should not change' WHERE id = ${taskId}::uuid
      `);
    });

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title, created_by_org_member_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Blocked in RO ws',
            ${membershipId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    const boardId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_boards (organization_id, workspace_id, name)
          VALUES (${orgId}::uuid, ${wsId}::uuid, 'RO board')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_buckets (organization_id, board_id, name, sort_key)
          VALUES (${orgId}::uuid, ${boardId}::uuid, 'Blocked bucket', 'z')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    const after = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`SELECT title FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    expect(after[0]?.title).toBe('Read-only WS task');
  });

  it('R4-9/R4-10/R4-11: closed Project A blocks only A-context tasks in shared workspace', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId, projectBId]);
    const taskAId = await insertTask(wsId, projectAId, 'Closed A task');
    const taskBId = await insertTask(wsId, projectBId, 'Open B task');
    const taskWideId = await insertTask(wsId, null, 'Workspace wide open');

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE projects SET is_read_only = true WHERE id = ${projectAId}::uuid
      `);
    });

    const { userId, membershipId } = await createMemberWithPermissions(
      'closeout-user',
      ['tasks.read', 'tasks.update', 'tasks.create', 'projects.read'],
      projectAId,
    );
    await addWorkspaceMember(wsId, membershipId, 'contributor');
    await database.asService(async (db) => {
      await db.insert(projectAccessGrants).values({
        organizationId: orgId,
        userId,
        projectId: projectBId,
        accessLevel: 'read',
      });
    });

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated closed A' WHERE id = ${taskAId}::uuid
      `);
    });
    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated open B' WHERE id = ${taskBId}::uuid
      `);
    });
    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE tasks SET title = 'Mutated wide' WHERE id = ${taskWideId}::uuid
      `);
    });

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO tasks (
            organization_id, workspace_id, project_id, title, created_by_org_member_id
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Blocked on closed A',
            ${membershipId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    const titles = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(titles.map((r) => r.title)).toEqual([
      'Closed A task',
      'Mutated open B',
      'Mutated wide',
    ]);
  });

  it('R4-12: service_role path remains functional after semantic auth (regression)', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE workspaces SET is_read_only = true WHERE id = ${wsId}::uuid
      `);
      await db.execute(sql`
        UPDATE projects SET is_read_only = true WHERE id = ${projectAId}::uuid
      `);
      await db.execute(sql`
        INSERT INTO tasks (
          organization_id, workspace_id, project_id, title, created_by_system
        ) VALUES (
          ${orgId}::uuid, ${wsId}::uuid, ${projectAId}::uuid, 'Service bypass RO', true
        )
      `);
    });

    const rows = await database.asService(async (db) =>
      resultRows<{ title: string }>(
        await db.execute(sql`
          SELECT title FROM tasks WHERE title = 'Service bypass RO'
        `),
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it('F5-1: workspace is_read_only blocks task_boards INSERT/UPDATE/DELETE, SELECT allowed', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    const boardId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_boards (organization_id, workspace_id, name)
          VALUES (${orgId}::uuid, ${wsId}::uuid, 'Board before RO')
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE workspaces SET is_read_only = true WHERE id = ${wsId}::uuid
      `);
    });

    const { userId } = await createMemberWithPermissions(
      'board-ro-manager',
      ['tasks.read', 'workspaces.manage', 'projects.read'],
      projectAId,
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM task_boards WHERE workspace_id = ${wsId}::uuid
        `),
      ),
    );
    expect(visible).toHaveLength(1);

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_boards (organization_id, workspace_id, name)
          VALUES (${orgId}::uuid, ${wsId}::uuid, 'Blocked board insert')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`
        UPDATE task_boards SET name = 'Blocked board update' WHERE id = ${boardId}::uuid
      `);
    });

    await database.asUser(userId, async (tx) => {
      await tx.execute(sql`DELETE FROM task_boards WHERE id = ${boardId}::uuid`);
    });

    const after = await database.asService(async (db) =>
      resultRows<{ name: string }>(
        await db.execute(sql`
          SELECT name FROM task_boards WHERE id = ${boardId}::uuid
        `),
      ),
    );
    expect(after[0]?.name).toBe('Board before RO');
  });

  it('F5-2: archived board blocks bucket structural mutation but remains readable', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);

    const boardId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO task_boards (
            organization_id, workspace_id, name, is_archived, archived_at
          ) VALUES (
            ${orgId}::uuid, ${wsId}::uuid, 'Archived board', true, now()
          )
          RETURNING id
        `),
      );
      return rows[0]!.id;
    });

    const { userId } = await createMemberWithPermissions(
      'archived-board-manager',
      ['tasks.read', 'workspaces.manage', 'projects.read'],
      projectAId,
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM task_boards WHERE id = ${boardId}::uuid`),
      ),
    );
    expect(visible).toHaveLength(1);

    await expect(
      database.asUser(userId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO task_buckets (organization_id, board_id, name, sort_key)
          VALUES (${orgId}::uuid, ${boardId}::uuid, 'Blocked on archived', 'a')
        `);
      }),
    ).rejects.toThrow(/permission denied|42501|policy|Failed query/i);
  });

  it('F5-3: employee assignment date bounds — current yes, future/expired no', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId]);
    const taskId = await insertTask(wsId, projectAId, 'Date bounded task');

    const { userId: currentUser } = await createEmployeeWithGrants(
      'assign-current',
      [{ permissionKey: 'tasks.read', scope: 'assigned_only' }],
      {
        projectAssignments: [{ projectId: projectAId, startDate: '2026-01-01', endDate: null }],
      },
    );
    const { userId: futureUser } = await createEmployeeWithGrants(
      'assign-future',
      [{ permissionKey: 'tasks.read', scope: 'assigned_only' }],
      {
        projectAssignments: [{ projectId: projectAId, startDate: '2099-01-01', endDate: null }],
      },
    );
    const { userId: expiredUser } = await createEmployeeWithGrants(
      'assign-expired',
      [{ permissionKey: 'tasks.read', scope: 'assigned_only' }],
      {
        projectAssignments: [
          { projectId: projectAId, startDate: '2020-01-01', endDate: '2020-12-31' },
        ],
      },
    );

    const currentVisible = await database.asUser(currentUser, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    const futureVisible = await database.asUser(futureUser, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );
    const expiredVisible = await database.asUser(expiredUser, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM tasks WHERE id = ${taskId}::uuid`),
      ),
    );

    expect(currentVisible).toHaveLength(1);
    expect(futureVisible).toHaveLength(0);
    expect(expiredVisible).toHaveLength(0);
  });

  it('F5-4/F5-5: linked employee keeps org-role task permissions over employee grants', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId, projectBId]);
    await insertTask(wsId, projectAId, 'Org path A');
    await insertTask(wsId, projectBId, 'Org path B');

    const { userId } = await createMemberWithPermissions(
      'linked-manager',
      ['tasks.read', 'tasks.manage_all', 'projects.read'],
      projectAId,
    );
    await database.asService(async (db) => {
      await db.insert(projectAccessGrants).values({
        organizationId: orgId,
        userId,
        projectId: projectBId,
        accessLevel: 'read',
      });
    });
    const { employeeId } = await linkUserToEmployee(userId, 'linked-manager');

    const withoutEmployeeGrant = await database.asUser(userId, async (tx) =>
      resultRows<{ title: string }>(
        await tx.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(withoutEmployeeGrant.map((r) => r.title)).toEqual(['Org path A', 'Org path B']);

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO employee_permission_grants (
          organization_id, employee_id, permission_key, scope, granted
        ) VALUES (
          ${orgId}::uuid, ${employeeId}::uuid, 'tasks.read', 'self_only'::permission_scope, true
        )
      `);
    });

    const withRestrictiveGrant = await database.asUser(userId, async (tx) =>
      resultRows<{ title: string }>(
        await tx.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(withRestrictiveGrant.map((r) => r.title)).toEqual(['Org path A', 'Org path B']);
  });

  it('F5-6: employee-only user remains restricted by scoped employee grants', async () => {
    const wsId = await insertWorkspace('organization');
    await linkProjects(wsId, [projectAId, projectBId]);
    await insertTask(wsId, projectAId, 'Employee only A');
    await insertTask(wsId, projectBId, 'Employee only B');

    const { userId } = await createEmployeeWithGrants(
      'employee-only',
      [{ permissionKey: 'tasks.read', scope: 'assigned_only' }],
      { projectIds: [projectAId] },
    );

    const visible = await database.asUser(userId, async (tx) =>
      resultRows<{ title: string }>(
        await tx.execute(sql`
          SELECT title FROM tasks WHERE workspace_id = ${wsId}::uuid ORDER BY title
        `),
      ),
    );
    expect(visible.map((r) => r.title)).toEqual(['Employee only A']);
  });

  it('seeds 19 UWM permission keys from migration 0109', async () => {
    const expectedKeys = [
      'tasks.read',
      'tasks.create',
      'tasks.update',
      'tasks.delete',
      'tasks.assign',
      'tasks.manage_all',
      'tasks.comment',
      'tasks.approve',
      'portfolio.read',
      'workload.read',
      'operations.read',
      'workspaces.manage',
      'stages.manage',
      'modules.manage',
      'labels.manage',
      'task_templates.manage',
      'project_templates.manage',
      'meetings.read',
      'meetings.manage',
    ];
    const rows = await database.asService(async (db) =>
      resultRows<{ key: string }>(
        await db.execute(sql`
          SELECT key FROM permissions
          WHERE key IN (
            'tasks.read', 'tasks.create', 'tasks.update', 'tasks.delete',
            'tasks.assign', 'tasks.manage_all', 'tasks.comment', 'tasks.approve',
            'portfolio.read', 'workload.read', 'operations.read', 'workspaces.manage',
            'stages.manage', 'modules.manage', 'labels.manage', 'task_templates.manage',
            'project_templates.manage', 'meetings.read', 'meetings.manage'
          )
          ORDER BY key
        `),
      ),
    );
    expect(rows).toHaveLength(19);
    expect(rows.map((r) => r.key).sort()).toEqual([...expectedKeys].sort());
  });
});
