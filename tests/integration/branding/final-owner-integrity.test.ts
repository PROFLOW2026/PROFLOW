import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { sql } from 'drizzle-orm';
import { ensureDefaultBranding } from '@/modules/branding';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../clients/setup';

function errorText(err: unknown): string {
  return [
    err instanceof Error ? err.message : String(err),
    err instanceof Error && err.cause instanceof Error ? err.cause.message : '',
    err instanceof Error && err.cause ? String(err.cause) : '',
  ].join('\n');
}

async function expectSqlDenied(
  database: TestDatabase,
  userId: string,
  run: (tx: Parameters<Parameters<TestDatabase['asUser']>[1]>[0]) => Promise<unknown>,
) {
  await expect(
    database.asUser(userId, async (tx) => {
      await run(tx);
    }),
  ).rejects.toSatisfy((err: unknown) =>
    /permission denied|missing permission|brand snapshot subject|project access denied|42501|Failed query/i.test(
      errorText(err),
    ),
  );
}

async function createScopedMember(
  database: TestDatabase,
  orgId: string,
  email: string,
  permissionKeys: string[],
  projectIds: string[],
) {
  const user = await createTestUser(database, email);
  const roleId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  await database.asService(async (db) => {
    await db.execute(sql`SET ROLE service_role`);
    await db.execute(sql`
      INSERT INTO organization_settings (organization_id, key, value)
      VALUES (${orgId}::uuid, 'project_access_mode', '"selected"'::jsonb)
      ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value
    `);
    await db.execute(sql`
      INSERT INTO organization_memberships (id, organization_id, user_id, status)
      VALUES (${membershipId}::uuid, ${orgId}::uuid, ${user.id}::uuid, 'active')
    `);
    await db.execute(sql`
      INSERT INTO roles (id, organization_id, key, name, rank, is_protected)
      VALUES (${roleId}::uuid, ${orgId}::uuid, ${`scoped_${email}`}, 'Scoped', 50, false)
    `);
    for (const key of permissionKeys) {
      await db.execute(sql`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES (${orgId}::uuid, ${roleId}::uuid, ${key})
      `);
    }
    await db.execute(sql`
      INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
      VALUES (${orgId}::uuid, ${membershipId}::uuid, ${user.id}::uuid, ${roleId}::uuid)
    `);
    for (const projectId of projectIds) {
      await db.execute(sql`
        INSERT INTO project_access_grants (organization_id, user_id, project_id, access_level)
        VALUES (${orgId}::uuid, ${user.id}::uuid, ${projectId}::uuid, 'read')
      `);
    }
  });
  return user;
}

describe('0062 final owner integrity closure', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('BLOCKS direct authenticated INSERT/UPDATE/DELETE on document_brand_snapshots', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const snapshotId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });

      const estimateId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.estimates (
          id, organization_id, title, status, currency, tax_mode
        ) VALUES (
          ${estimateId}::uuid, ${orgA.organization.id}::uuid,
          'Snap Quote', 'sent', 'ILS', 'exclusive'
        )
      `);
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'quote', ${estimateId}::uuid, NULL::uuid
        )
      `);
      const [row] = resultRows<{ id: string; snapshot: { companyDisplayName?: string } }>(
        await tx.execute(sql`
          SELECT id, snapshot FROM public.document_brand_snapshots
          WHERE organization_id = ${orgA.organization.id}::uuid
            AND entity_type = 'quote'
            AND entity_id = ${estimateId}::uuid
        `),
      );
      expect(row?.id).toBeTruthy();
      return { id: row!.id, name: row!.snapshot.companyDisplayName };
    });

    const policies = await database.asService(async (db) =>
      resultRows<{ policyname: string }>(
        await db.execute(sql`
          SELECT policyname FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'document_brand_snapshots'
          ORDER BY policyname
        `),
      ),
    );
    expect(policies.map((p) => p.policyname)).toEqual([
      'document_brand_snapshots_service_all',
      'document_brand_snapshots_tenant_select',
    ]);

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        INSERT INTO public.document_brand_snapshots (
          organization_id, entity_type, entity_id, snapshot
        ) VALUES (
          ${orgA.organization.id}::uuid,
          'report',
          ${crypto.randomUUID()}::uuid,
          '{"version":1,"companyDisplayName":"hack"}'::jsonb
        )
      `);
    });

    // No UPDATE/DELETE policies: RLS silently skips rows (0 affected), content stays.
    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        UPDATE public.document_brand_snapshots
           SET snapshot = '{"version":1,"companyDisplayName":"MUTATED"}'::jsonb
         WHERE id = ${snapshotId.id}::uuid
      `);
      await tx.execute(sql`
        UPDATE public.document_brand_snapshots
           SET brand_profile_id = NULL, entity_type = 'report'
         WHERE id = ${snapshotId.id}::uuid
      `);
      await tx.execute(sql`
        DELETE FROM public.document_brand_snapshots WHERE id = ${snapshotId.id}::uuid
      `);
      const [row] = resultRows<{
        id: string;
        entity_type: string;
        snapshot: { companyDisplayName?: string };
      }>(
        await tx.execute(sql`
          SELECT id, entity_type, snapshot
          FROM public.document_brand_snapshots
          WHERE id = ${snapshotId.id}::uuid
        `),
      );
      expect(row?.id).toBe(snapshotId.id);
      expect(row?.entity_type).toBe('quote');
      expect(row?.snapshot.companyDisplayName).toBe(snapshotId.name);
      expect(row?.snapshot.companyDisplayName).not.toBe('MUTATED');
    });
  });

  it('resolves form_submission project for all owner paths and blocks restricted cross-project', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const seeded = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      const projectA = await createProject(context, { name: 'Form A' });
      const projectB = await createProject(context, { name: 'Form B' });

      const templateId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.form_templates (id, organization_id, name, schema_json)
        VALUES (${templateId}::uuid, ${orgA.organization.id}::uuid, 'T', '{}'::jsonb)
      `);

      const owners: Record<string, string> = {};

      // planning_task on B
      const taskB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.planning_work_items (
          id, organization_id, project_id, name, kind
        ) VALUES (
          ${taskB}::uuid, ${orgA.organization.id}::uuid, ${projectB.projectId}::uuid,
          'Task B', 'task'
        )
      `);
      owners.planning_task = taskB;

      // maintenance via asset assigned to B
      const assetB = crypto.randomUUID();
      const maintB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.assets (
          id, organization_id, name, assigned_project_id
        ) VALUES (
          ${assetB}::uuid, ${orgA.organization.id}::uuid, 'Asset B', ${projectB.projectId}::uuid
        )
      `);
      await tx.execute(sql`
        INSERT INTO public.maintenance_records (
          id, organization_id, asset_id, title, status
        ) VALUES (
          ${maintB}::uuid, ${orgA.organization.id}::uuid, ${assetB}::uuid, 'Maint B', 'planned'
        )
      `);
      owners.maintenance = maintB;

      // field_log on B
      const logB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.daily_logs (
          id, organization_id, project_id, log_date, summary, status
        ) VALUES (
          ${logB}::uuid, ${orgA.organization.id}::uuid, ${projectB.projectId}::uuid,
          CURRENT_DATE, 'Log B', 'finalized'
        )
      `);
      owners.field_log = logB;

      // inspection on B
      const inspB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.inspections (
          id, organization_id, project_id, title, status
        ) VALUES (
          ${inspB}::uuid, ${orgA.organization.id}::uuid, ${projectB.projectId}::uuid,
          'Insp B', 'passed'
        )
      `);
      owners.inspection = inspB;

      const submissions: Record<string, string> = {};
      for (const [ownerType, ownerId] of Object.entries(owners)) {
        const sid = crypto.randomUUID();
        await tx.execute(sql`
          INSERT INTO public.form_submissions (
            id, organization_id, template_id, owner_type, owner_id, status, submitted_by_user_id
          ) VALUES (
            ${sid}::uuid, ${orgA.organization.id}::uuid, ${templateId}::uuid,
            ${ownerType}, ${ownerId}::uuid, 'draft', ${userA.id}::uuid
          )
        `);
        await tx.execute(sql`
          UPDATE public.form_submissions
             SET status = 'submitted', submitted_at = now()
           WHERE id = ${sid}::uuid
        `);
        submissions[ownerType] = sid;
      }

      // Also a direct project-owned submission on B for baseline
      const directB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.form_submissions (
          id, organization_id, template_id, owner_type, owner_id, status, submitted_by_user_id
        ) VALUES (
          ${directB}::uuid, ${orgA.organization.id}::uuid, ${templateId}::uuid,
          'project', ${projectB.projectId}::uuid, 'draft', ${userA.id}::uuid
        )
      `);
      await tx.execute(sql`
        UPDATE public.form_submissions
           SET status = 'submitted', submitted_at = now()
         WHERE id = ${directB}::uuid
      `);
      submissions.project = directB;

      return {
        projectAId: projectA.projectId,
        projectBId: projectB.projectId,
        submissions,
      };
    });

    // Owner can freeze each path
    for (const [ownerType, submissionId] of Object.entries(seeded.submissions)) {
      await database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.freeze_document_brand_snapshot(
            ${orgA.organization.id}::uuid,
            'form_submission',
            ${submissionId}::uuid,
            NULL::uuid
          )
        `);
        const [row] = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM public.document_brand_snapshots
            WHERE organization_id = ${orgA.organization.id}::uuid
              AND entity_type = 'form_submission'
              AND entity_id = ${submissionId}::uuid
          `),
        );
        expect(row?.id, ownerType).toBeTruthy();
      });
    }

    // Fresh submissions on B for restricted denial (first-write already done above)
    const denialIds = await database.asUser(userA.id, async (tx) => {
      const templateId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.form_templates (id, organization_id, name, schema_json)
        VALUES (${templateId}::uuid, ${orgA.organization.id}::uuid, 'T2', '{}'::jsonb)
      `);
      const ids: string[] = [];
      for (const ownerType of ['planning_task', 'maintenance', 'field_log', 'inspection'] as const) {
        // Reuse same owners by looking up via existing submissions' owners is hard;
        // recreate minimal owners on project B.
        let ownerId = crypto.randomUUID();
        if (ownerType === 'planning_task') {
          await tx.execute(sql`
            INSERT INTO public.planning_work_items (
              id, organization_id, project_id, name, kind
            ) VALUES (
              ${ownerId}::uuid, ${orgA.organization.id}::uuid, ${seeded.projectBId}::uuid,
              'Task deny', 'task'
            )
          `);
        } else if (ownerType === 'maintenance') {
          const assetId = crypto.randomUUID();
          await tx.execute(sql`
            INSERT INTO public.assets (
              id, organization_id, name, assigned_project_id
            ) VALUES (
              ${assetId}::uuid, ${orgA.organization.id}::uuid, 'Asset deny',
              ${seeded.projectBId}::uuid
            )
          `);
          await tx.execute(sql`
            INSERT INTO public.maintenance_records (
              id, organization_id, asset_id, title, status
            ) VALUES (
              ${ownerId}::uuid, ${orgA.organization.id}::uuid, ${assetId}::uuid,
              'Maint deny', 'planned'
            )
          `);
        } else if (ownerType === 'field_log') {
          await tx.execute(sql`
            INSERT INTO public.daily_logs (
              id, organization_id, project_id, log_date, summary, status
            ) VALUES (
              ${ownerId}::uuid, ${orgA.organization.id}::uuid, ${seeded.projectBId}::uuid,
              CURRENT_DATE + 1, 'Log deny', 'finalized'
            )
          `);
        } else {
          await tx.execute(sql`
            INSERT INTO public.inspections (
              id, organization_id, project_id, title, status
            ) VALUES (
              ${ownerId}::uuid, ${orgA.organization.id}::uuid, ${seeded.projectBId}::uuid,
              'Insp deny', 'passed'
            )
          `);
        }
        const sid = crypto.randomUUID();
        await tx.execute(sql`
          INSERT INTO public.form_submissions (
            id, organization_id, template_id, owner_type, owner_id, status, submitted_by_user_id
          ) VALUES (
            ${sid}::uuid, ${orgA.organization.id}::uuid, ${templateId}::uuid,
            ${ownerType}, ${ownerId}::uuid, 'draft', ${userA.id}::uuid
          )
        `);
        await tx.execute(sql`
          UPDATE public.form_submissions
             SET status = 'submitted', submitted_at = now()
           WHERE id = ${sid}::uuid
        `);
        ids.push(sid);
      }
      return ids;
    });

    const scoped = await createScopedMember(
      database,
      orgA.organization.id,
      'form-scoped@example.test',
      ['forms.submit', 'forms.manage', 'org.read', 'projects.read'],
      [seeded.projectAId],
    );

    for (const submissionId of denialIds) {
      await expectSqlDenied(database, scoped.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.freeze_document_brand_snapshot(
            ${orgA.organization.id}::uuid,
            'form_submission',
            ${submissionId}::uuid,
            NULL::uuid
          )
        `);
      });
    }
  });

  it('BLOCKS timesheet returned and communication failed; PASS approved/sent', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const ids = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });

      const employeeId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.employees (id, organization_id, name, status)
        VALUES (${employeeId}::uuid, ${orgA.organization.id}::uuid, 'Worker', 'active')
      `);

      const returnedId = crypto.randomUUID();
      const approvedId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.timesheets (
          id, organization_id, employee_id, period_start, period_end, status
        ) VALUES
          (
            ${returnedId}::uuid, ${orgA.organization.id}::uuid, ${employeeId}::uuid,
            '2026-01-01', '2026-01-07', 'returned'
          ),
          (
            ${approvedId}::uuid, ${orgA.organization.id}::uuid, ${employeeId}::uuid,
            '2026-01-08', '2026-01-14', 'approved'
          )
      `);

      const failedId = crypto.randomUUID();
      const sentId = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.outbound_communications (
          id, organization_id, related_entity_type, recipient_email, subject, body_text, status
        ) VALUES
          (
            ${failedId}::uuid, ${orgA.organization.id}::uuid, 'other',
            'a@example.test', 'Fail', 'body', 'draft'
          ),
          (
            ${sentId}::uuid, ${orgA.organization.id}::uuid, 'other',
            'a@example.test', 'Sent', 'body', 'draft'
          )
      `);

      return { returnedId, approvedId, failedId, sentId };
    });

    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.request_outbound_communication_send(
          ${orgA.organization.id}::uuid, ${ids.failedId}::uuid
        )
      `);
      await tx.execute(sql`
        SELECT app.request_outbound_communication_send(
          ${orgA.organization.id}::uuid, ${ids.sentId}::uuid
        )
      `);
    });

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`SELECT app.next_gen_latch_acquire('outbound_delivery')`);
      try {
        await db.execute(sql`
          UPDATE public.outbound_communications
             SET status = 'failed', last_error = 'boom'
           WHERE id = ${ids.failedId}::uuid
        `);
      } finally {
        await db.execute(sql`SELECT app.next_gen_latch_release('outbound_delivery')`);
      }
      await db.execute(sql`
        SELECT app.confirm_outbound_communication_delivery(
          ${orgA.organization.id}::uuid,
          ${ids.sentId}::uuid,
          'test',
          'msg-1'
        )
      `);
    });

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'timesheet', ${ids.returnedId}::uuid, NULL::uuid
        )
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'timesheet', ${ids.approvedId}::uuid, NULL::uuid
        )
      `);
    });

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'communication', ${ids.failedId}::uuid, NULL::uuid
        )
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'communication', ${ids.sentId}::uuid, NULL::uuid
        )
      `);
    });
  });
});
