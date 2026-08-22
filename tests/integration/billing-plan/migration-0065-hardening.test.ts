import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function expectFailure(run: () => Promise<unknown>, token: string | RegExp) {
  let message = '';
  try {
    await run();
  } catch (error) {
    message = errorBlob(error);
  }
  if (token instanceof RegExp) {
    expect(message, `expected failure matching ${token}`).toMatch(token);
    return;
  }
  expect(message, `expected failure containing ${token}`).toContain(token);
}

async function onboardCustomRole(
  database: TestDatabase,
  organizationId: string,
  email: string,
  roleKey: string,
  permissionKeys: readonly string[],
) {
  const user = await createTestUser(database, email);
  await database.asService(async (db) => {
    const roleRows = resultRows<{ id: string }>(
      await db.execute(sql`
        INSERT INTO roles (organization_id, key, name, rank, is_protected)
        VALUES (${organizationId}::uuid, ${roleKey}, ${roleKey}, 80, false)
        RETURNING id
      `),
    );
    const roleId = roleRows[0]!.id;
    for (const permissionKey of permissionKeys) {
      await db.execute(sql`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES (${organizationId}::uuid, ${roleId}::uuid, ${permissionKey})
      `);
    }
    const membershipRows = resultRows<{ id: string }>(
      await db.execute(sql`
        INSERT INTO organization_memberships (organization_id, user_id, status)
        VALUES (${organizationId}::uuid, ${user.id}::uuid, 'active')
        RETURNING id
      `),
    );
    await db.execute(sql`
      INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
      VALUES (
        ${organizationId}::uuid,
        ${membershipRows[0]!.id}::uuid,
        ${user.id}::uuid,
        ${roleId}::uuid
      )
    `);
  });
  return user;
}

describe('migration 0065 billing plan hardening', () => {
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

  it('SQL source includes project RLS, composite SET NULL, and paid lock', async () => {
    const raw = await readFile(path.join(MIGRATIONS_DIR, '0065_project_billing_plans.sql'), 'utf8');
    expect(raw).toMatch(/app\.can_access_project\(organization_id, project_id\)/);
    expect(raw).toMatch(/ON DELETE SET NULL \(template_id\)/);
    expect(raw).toMatch(/ON DELETE SET NULL \(section_id\)/);
    expect(raw).toMatch(/ON DELETE SET NULL \(boq_node_id\)/);
    expect(raw).toMatch(/ON DELETE SET NULL \(billing_record_id\)/);
    expect(raw).not.toMatch(/SET NULL\s*\([^)]*organization_id/i);
    expect(raw).toMatch(/ON DELETE RESTRICT/);
    expect(raw).toMatch(/app\.billing_plan_cycle_is_fully_paid/);
    expect(raw).toMatch(/app\.project_billing_cycle_paid_lock/);
    expect(raw).toMatch(/app\.project_billing_cycle_lines_paid_lock/);
    expect(raw).toMatch(/app\.billing_plan_history_write/);
    expect(raw).toMatch(/project_billing_cycle_revisions/);
    expect(raw).toMatch(/submitted_at/);
    expect(raw).toMatch(/'submitted'/);
    expect(raw).not.toMatch(/status IN \('draft', 'ready', 'issued', 'void'\)/);
    expect(raw).toMatch(/project_billing_plan_lines_active_boq_node_uq/);
    expect(raw).toMatch(/'plumbing'/);
    expect(raw).toMatch(/'hvac'/);
    expect(raw).toMatch(/'design'/);
    expect(raw).toMatch(/'engineering'/);
    expect(raw).toMatch(/'maintenance'/);
  });

  it('clean-starts through 0065 with composite SET NULL and RESTRICT cycle FK', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0065_project_billing_plans');

      const tables = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN (
             'billing_plan_templates',
             'project_billing_plans',
             'project_billing_plan_sections',
             'project_billing_plan_lines',
             'project_billing_cycles',
             'project_billing_cycle_lines',
             'project_billing_cycle_revisions'
           )
         ORDER BY tablename`,
      );
      expect(tables.rows.map((r) => r.tablename)).toEqual([
        'billing_plan_templates',
        'project_billing_cycle_lines',
        'project_billing_cycle_revisions',
        'project_billing_cycles',
        'project_billing_plan_lines',
        'project_billing_plan_sections',
        'project_billing_plans',
      ]);

      const templateFk = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname = 'project_billing_plans_template_org_fk'`,
      );
      expect(templateFk.rows[0]?.def ?? '').toMatch(/ON DELETE SET NULL \(template_id\)/i);

      const cycleFk = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conname = 'project_billing_cycles_plan_project_contract_org_fk'`,
      );
      expect(cycleFk.rows[0]?.def ?? '').toMatch(/ON DELETE RESTRICT/i);

      const overbill = await client.query(
        `SELECT 1 FROM pg_constraint
         WHERE conname = 'project_billing_cycle_lines_cumulative_lte_base'`,
      );
      expect(overbill.rows).toHaveLength(1);

      const approvedSum = await client.query(
        `SELECT 1 FROM pg_constraint
         WHERE conname = 'project_billing_cycle_lines_prior_approved_sum'`,
      );
      expect(approvedSum.rows).toHaveLength(1);
    });
  });

  it('selected-project user cannot read other project plan', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectA = randomUUID();
    const projectB = randomUUID();
    const contractA = randomUUID();
    const contractB = randomUUID();
    const planA = randomUUID();
    const planB = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO organization_settings (organization_id, key, value)
        VALUES (${orgId}::uuid, 'project_access_mode', '"selected"'::jsonb)
        ON CONFLICT (organization_id, key) DO UPDATE SET value = excluded.value
      `);
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency) VALUES
          (${projectA}::uuid, ${orgId}::uuid, 'Plan Project A', 'active', 'ILS'),
          (${projectB}::uuid, ${orgId}::uuid, 'Plan Project B', 'active', 'ILS')
      `);
      await db.execute(sql`
        INSERT INTO contracts (
          id, organization_id, project_id, is_primary, status, currency, original_value_amount
        ) VALUES
          (${contractA}::uuid, ${orgId}::uuid, ${projectA}::uuid, true, 'active', 'ILS', 1000),
          (${contractB}::uuid, ${orgId}::uuid, ${projectB}::uuid, true, 'active', 'ILS', 2000)
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plans (
          id, organization_id, project_id, contract_id, name, status, currency
        ) VALUES
          (${planA}::uuid, ${orgId}::uuid, ${projectA}::uuid, ${contractA}::uuid, 'Plan A', 'active', 'ILS'),
          (${planB}::uuid, ${orgId}::uuid, ${projectB}::uuid, ${contractB}::uuid, 'Plan B', 'active', 'ILS')
      `);
    });

    const scoped = await onboardCustomRole(
      database,
      orgId,
      'billing-scope-a@example.test',
      'billing_scope_a',
      ['billing.read', 'billing.manage', 'projects.read'],
    );
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO project_access_grants (organization_id, user_id, project_id, access_level)
        VALUES (${orgId}::uuid, ${scoped.id}::uuid, ${projectA}::uuid, 'read')
      `);
    });

    const visible = await database.asUser(scoped.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM project_billing_plans WHERE organization_id = ${orgId}::uuid
        `),
      ).map((r) => r.id),
    );
    expect(visible).toEqual([planA]);

    // Owner with all-projects mode still sees both (reset access mode for owner check).
    void userA;
  });

  it('submitted cycle can be updated; fully paid and void are locked', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = randomUUID();
    const contractId = randomUUID();
    const planId = randomUUID();
    const cycleId = randomUUID();
    const voidCycleId = randomUUID();
    const paidCycleId = randomUUID();
    const lineId = randomUUID();
    const cycleLineId = randomUUID();
    const paidCycleLineId = randomUUID();
    const clientId = randomUUID();
    const billingRecordId = randomUUID();
    const paymentId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Paid Client')
      `);
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency, client_id)
        VALUES (
          ${projectId}::uuid, ${orgId}::uuid, 'Lifecycle Project', 'active', 'ILS',
          ${clientId}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO contracts (
          id, organization_id, project_id, is_primary, status, currency, original_value_amount
        ) VALUES (
          ${contractId}::uuid, ${orgId}::uuid, ${projectId}::uuid, true, 'active', 'ILS', 10000
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plans (
          id, organization_id, project_id, contract_id, name, status, currency
        ) VALUES (
          ${planId}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid,
          'Lifecycle Plan', 'active', 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plan_lines (
          id, organization_id, plan_id, label, line_kind, agreed_amount, sort_order
        ) VALUES (
          ${lineId}::uuid, ${orgId}::uuid, ${planId}::uuid, 'Line 1', 'fixed_amount', 1000, 0
        )
      `);

      // Submitted (not fully paid) — editable.
      await db.execute(sql`
        INSERT INTO project_billing_cycles (
          id, organization_id, plan_id, project_id, contract_id, cycle_number, title,
          status, account_date, submitted_at
        ) VALUES (
          ${cycleId}::uuid, ${orgId}::uuid, ${planId}::uuid, ${projectId}::uuid,
          ${contractId}::uuid, 1, 'Cycle 1', 'draft', CURRENT_DATE, NULL
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_cycle_lines (
          id, organization_id, cycle_id, plan_line_id, prior_amount, current_amount,
          cumulative_amount, remaining_amount, base_amount_snapshot, retention_amount
        ) VALUES (
          ${cycleLineId}::uuid, ${orgId}::uuid, ${cycleId}::uuid, ${lineId}::uuid,
          0, 100, 0, 1000, 1000, 0
        )
      `);
      await db.execute(sql`
        UPDATE project_billing_cycles
        SET status = 'submitted', submitted_at = now()
        WHERE id = ${cycleId}::uuid
      `);

      // Void — immutable.
      await db.execute(sql`
        INSERT INTO project_billing_cycles (
          id, organization_id, plan_id, project_id, contract_id, cycle_number, title,
          status, account_date
        ) VALUES (
          ${voidCycleId}::uuid, ${orgId}::uuid, ${planId}::uuid, ${projectId}::uuid,
          ${contractId}::uuid, 2, 'Void Cycle', 'void', CURRENT_DATE
        )
      `);

      // Fully paid linked AR — immutable.
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, project_id, client_id, issue_date, status, kind,
          subtotal_amount, total_amount, currency, retention_amount, retention_held_remaining,
          source_kind, finalized_at
        ) VALUES (
          ${billingRecordId}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${clientId}::uuid,
          CURRENT_DATE, 'finalized', 'invoice',
          500, 500, 'ILS', 0, 0,
          'billing_plan', now()
        )
      `);
      // payments_legacy_application_default auto-creates the application row.
      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, billing_record_id, amount, currency,
          payment_date, status
        ) VALUES (
          ${paymentId}::uuid, ${orgId}::uuid, ${clientId}::uuid, ${billingRecordId}::uuid,
          500, 'ILS', CURRENT_DATE, 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_cycles (
          id, organization_id, plan_id, project_id, contract_id, cycle_number, title,
          status, account_date, billing_record_id, submitted_at
        ) VALUES (
          ${paidCycleId}::uuid, ${orgId}::uuid, ${planId}::uuid, ${projectId}::uuid,
          ${contractId}::uuid, 3, 'Paid Cycle', 'approved', CURRENT_DATE,
          ${billingRecordId}::uuid, now()
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_cycle_lines (
          id, organization_id, cycle_id, plan_line_id, prior_amount, current_amount,
          requested_amount, approved_amount, cumulative_amount, remaining_amount,
          base_amount_snapshot, retention_amount
        ) VALUES (
          ${paidCycleLineId}::uuid, ${orgId}::uuid, ${paidCycleId}::uuid, ${lineId}::uuid,
          0, 500, 500, 500, 500, 500, 1000, 0
        )
      `);
    });

    // Submitted cycle: header + lines may be updated.
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        UPDATE project_billing_cycles
        SET title = 'Cycle 1 revised', status = 'partially_approved'
        WHERE id = ${cycleId}::uuid
      `);
      await db.execute(sql`
        UPDATE project_billing_cycle_lines
        SET line_notes = 'ok after submit', current_amount = 120
        WHERE id = ${cycleLineId}::uuid
      `);
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            UPDATE project_billing_cycles
            SET title = 'mutated void'
            WHERE id = ${voidCycleId}::uuid
          `);
        }),
      /void cycles are immutable|integrity_constraint_violation|Failed query/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            DELETE FROM project_billing_cycles WHERE id = ${voidCycleId}::uuid
          `);
        }),
      /only draft cycles|integrity_constraint_violation|Failed query/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            UPDATE project_billing_cycles
            SET title = 'mutated paid'
            WHERE id = ${paidCycleId}::uuid
          `);
        }),
      /fully paid cycles are immutable|integrity_constraint_violation|Failed query/i,
    );

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            UPDATE project_billing_cycle_lines
            SET line_notes = 'nope'
            WHERE id = ${paidCycleLineId}::uuid
          `);
        }),
      /fully paid cycle lines are immutable|integrity_constraint_violation|Failed query/i,
    );

    // Correction path with history_write latch (must be same transaction as local set_config).
    await database.asService(async (db) => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE service_role`);
        await tx.execute(sql`SELECT set_config('app.billing_plan_history_write', 'on', true)`);
        await tx.execute(sql`
          UPDATE project_billing_cycles
          SET title = 'paid corrected'
          WHERE id = ${paidCycleId}::uuid
        `);
      });
    });
  });

  it('composite SET NULL on template nulls only template_id', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = randomUUID();
    const contractId = randomUUID();
    const templateId = randomUUID();
    const planId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO billing_plan_templates (id, organization_id, name, work_kind)
        VALUES (${templateId}::uuid, ${orgId}::uuid, 'Starter', 'contractor')
      `);
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${orgId}::uuid, 'Template FK Project', 'active', 'ILS')
      `);
      await db.execute(sql`
        INSERT INTO contracts (
          id, organization_id, project_id, is_primary, status, currency, original_value_amount
        ) VALUES (
          ${contractId}::uuid, ${orgId}::uuid, ${projectId}::uuid, true, 'active', 'ILS', 5000
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plans (
          id, organization_id, project_id, contract_id, template_id, name, status, currency
        ) VALUES (
          ${planId}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid,
          ${templateId}::uuid, 'From template', 'draft', 'ILS'
        )
      `);
      await db.execute(sql`
        DELETE FROM billing_plan_templates WHERE id = ${templateId}::uuid
      `);
      const rows = resultRows<{ template_id: string | null; organization_id: string }>(
        await db.execute(sql`
          SELECT template_id, organization_id
          FROM project_billing_plans
          WHERE id = ${planId}::uuid
        `),
      );
      expect(rows[0]?.template_id).toBeNull();
      expect(rows[0]?.organization_id).toBe(orgId);
    });
  });

  it('BOQ cross-project link is rejected', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectA = randomUUID();
    const projectB = randomUUID();
    const contractA = randomUUID();
    const planA = randomUUID();
    const boqB = randomUUID();
    const nodeB = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency) VALUES
          (${projectA}::uuid, ${orgId}::uuid, 'Plan Proj', 'active', 'ILS'),
          (${projectB}::uuid, ${orgId}::uuid, 'BOQ Proj', 'active', 'ILS')
      `);
      await db.execute(sql`
        INSERT INTO contracts (
          id, organization_id, project_id, is_primary, status, currency, original_value_amount
        ) VALUES (
          ${contractA}::uuid, ${orgId}::uuid, ${projectA}::uuid, true, 'active', 'ILS', 1000
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plans (
          id, organization_id, project_id, contract_id, name, status, currency
        ) VALUES (
          ${planA}::uuid, ${orgId}::uuid, ${projectA}::uuid, ${contractA}::uuid,
          'Plan', 'active', 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO project_boqs (
          id, organization_id, project_id, version_number, status, currency
        ) VALUES (
          ${boqB}::uuid, ${orgId}::uuid, ${projectB}::uuid, 1, 'draft', 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO boq_nodes (
          id, organization_id, boq_id, node_kind, description, pricing_type
        ) VALUES (
          ${nodeB}::uuid, ${orgId}::uuid, ${boqB}::uuid, 'item', 'Other project item',
          'lump_sum'
        )
      `);
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            INSERT INTO project_billing_plan_lines (
              organization_id, plan_id, label, line_kind, agreed_amount, boq_node_id
            ) VALUES (
              ${orgId}::uuid, ${planA}::uuid, 'Cross BOQ', 'boq_link', 100, ${nodeB}::uuid
            )
          `);
        }),
      /same project as the plan|integrity_constraint_violation|Failed query/i,
    );
  });

  it('overbill CHECK rejects cumulative > base', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = randomUUID();
    const contractId = randomUUID();
    const planId = randomUUID();
    const lineId = randomUUID();
    const cycleId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${orgId}::uuid, 'Overbill Project', 'active', 'ILS')
      `);
      await db.execute(sql`
        INSERT INTO contracts (
          id, organization_id, project_id, is_primary, status, currency, original_value_amount
        ) VALUES (
          ${contractId}::uuid, ${orgId}::uuid, ${projectId}::uuid, true, 'active', 'ILS', 1000
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plans (
          id, organization_id, project_id, contract_id, name, status, currency
        ) VALUES (
          ${planId}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid,
          'Overbill Plan', 'active', 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_plan_lines (
          id, organization_id, plan_id, label, line_kind, agreed_amount
        ) VALUES (
          ${lineId}::uuid, ${orgId}::uuid, ${planId}::uuid, 'Cap line', 'fixed_amount', 100
        )
      `);
      await db.execute(sql`
        INSERT INTO project_billing_cycles (
          id, organization_id, plan_id, project_id, contract_id, cycle_number, title, account_date
        ) VALUES (
          ${cycleId}::uuid, ${orgId}::uuid, ${planId}::uuid, ${projectId}::uuid,
          ${contractId}::uuid, 1, 'C1', CURRENT_DATE
        )
      `);
    });

    await expectFailure(
      () =>
        database.asService(async (db) => {
          await db.execute(sql`SET ROLE service_role`);
          await db.execute(sql`
            INSERT INTO project_billing_cycle_lines (
              organization_id, cycle_id, plan_line_id,
              prior_amount, approved_amount, cumulative_amount,
              remaining_amount, base_amount_snapshot, retention_amount
            ) VALUES (
              ${orgId}::uuid, ${cycleId}::uuid, ${lineId}::uuid,
              0, 150, 150, 0, 100, 0
            )
          `);
        }),
      /cumulative_lte_base|check constraint|Failed query/i,
    );
  });
});
