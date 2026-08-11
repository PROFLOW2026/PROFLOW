import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  resolveOrgContext,
} from '@/modules/tenancy';
import { createClient } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import {
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

async function applyMigrationFiles(client: PGlite, untilInclusive?: string): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const tag = file.replace(/\.sql$/, '');
    if (untilInclusive && tag > untilInclusive) break;
    const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
      await client.exec(statement);
    }
    if (untilInclusive && tag === untilInclusive) break;
  }
}

async function onboardRole(
  database: TestDatabase,
  ownerId: string,
  organizationId: string,
  email: string,
  roleKey: 'worker' | 'manager' | 'finance',
) {
  const invitation = await database.asUser(ownerId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId: ownerId, organizationId, locale: 'en' });
    return createInvitation(context, { email, roleKey });
  });
  const user = await createTestUser(database, email);
  await database.asService((db) =>
    acceptInvitation(db, { token: invitation.token, userId: user.id, userEmail: user.email }),
  );
  return user;
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

describe('migration hardening 0024–0029', () => {
  describe('clean start and 0023→latest', () => {
    it('clean-starts through 0029', async () => {
      const client = new PGlite();
      await client.waitReady;
      await applyMigrationFiles(client);
      const tables = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('estimates','approval_requests','month_close_periods','form_submissions','project_budgets')`,
      );
      expect(tables.rows.length).toBe(5);
      const helper = await client.query(
        `SELECT 1 FROM pg_proc WHERE proname = 'is_month_closed'`,
      );
      expect(helper.rows.length).toBe(1);
      await client.close();
    });

    it('upgrades 0023 → 0024–0029', async () => {
      const client = new PGlite();
      await client.waitReady;
      await applyMigrationFiles(client, '0023_attendance_rls_and_role_backfill');
      for (const file of [
        '0024_next_gen_permissions_modules_work_entity.sql',
        '0025_quotes_estimates.sql',
        '0026_service_dispatch_recurrence.sql',
        '0027_approvals_month_close_budgets.sql',
        '0028_forms_usage_command_recurring.sql',
        '0029_next_gen_integration_hardening.sql',
      ]) {
        const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
          await client.exec(statement);
        }
      }
      const fk = await client.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'estimates_converted_project_org_fk'`,
      );
      expect(fk.rows.length).toBe(1);
      await client.close();
    });
  });

  describe('adversarial RLS / FK / history', () => {
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

    it('rejects manufactured approved approval_requests and exposes only gate columns', async () => {
      const owner = await createTestUser(database, 'owner-appr@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Approval Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const worker = await onboardRole(
        database,
        owner.id,
        organizationId,
        'worker-appr@example.test',
        'worker',
      );

      const ruleId = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO approval_rules (organization_id, name, entity_type, threshold_amount, currency, enabled)
            VALUES (${organizationId}::uuid, 'Expense gate', 'expense', 100, 'ILS', true)
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(worker.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO approval_requests (
              organization_id, rule_id, entity_type, entity_id, amount, currency,
              status, submitted_by_user_id, decided_by_user_id, decided_at
            ) VALUES (
              ${organizationId}::uuid, ${ruleId}::uuid, 'expense', gen_random_uuid(),
              500, 'ILS', 'approved', ${worker.id}::uuid, ${worker.id}::uuid, now()
            )
          `),
        ).rejects.toThrow();
      });

      const workerGate = await database.asUser(worker.id, async (tx) =>
        resultRows<Record<string, unknown>>(
          await tx.execute(sql`
            SELECT * FROM app.enabled_approval_rules_for_gate(${organizationId}::uuid, 'expense')
          `),
        ),
      );
      expect(workerGate).toEqual([]);

      const gateCols = await database.asUser(owner.id, async (tx) =>
        resultRows<Record<string, unknown>>(
          await tx.execute(sql`
            SELECT * FROM app.enabled_approval_rules_for_gate(${organizationId}::uuid, 'expense')
          `),
        ),
      );
      expect(gateCols.length).toBe(1);
      expect(gateCols[0]).not.toHaveProperty('name');
      expect(gateCols[0]).toHaveProperty('threshold_amount');
    });

    it('blocks worker SELECT of month-close completeness but allows is_month_closed', async () => {
      const owner = await createTestUser(database, 'owner-mc@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Close Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const worker = await onboardRole(
        database,
        owner.id,
        organizationId,
        'worker-mc@example.test',
        'worker',
      );

      const periodId = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_periods (organization_id, year_month, status, completeness_percent, completeness_snapshot)
            VALUES (${organizationId}::uuid, '2026-08', 'open', 80, '{"percent":80}'::jsonb)
            RETURNING id
          `),
        );
        const id = inserted[0]!.id;
        await tx.execute(sql`
          UPDATE month_close_periods SET status = 'ready' WHERE id = ${id}::uuid
        `);
        await tx.execute(sql`
          UPDATE month_close_periods SET status = 'closed', closed_at = now(), closed_by_user_id = ${owner.id}::uuid
          WHERE id = ${id}::uuid
        `);
        return id;
      });

      const workerRows = await database.asUser(worker.id, async (tx) =>
        resultRows(
          await tx.execute(sql`
            SELECT completeness_snapshot FROM month_close_periods WHERE id = ${periodId}::uuid
          `),
        ),
      );
      expect(workerRows).toEqual([]);

      const closed = await database.asUser(worker.id, async (tx) =>
        resultRows<{ closed: boolean }>(
          await tx.execute(sql`
            SELECT app.is_month_closed(${organizationId}::uuid, '2026-08') AS closed
          `),
        ),
      );
      expect(closed[0]?.closed).toBe(true);

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE month_close_periods SET status = 'open' WHERE id = ${periodId}::uuid
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`DELETE FROM month_close_periods WHERE id = ${periodId}::uuid`),
        ).rejects.toThrow();
      });
    });

    it('rejects cross-org estimate client FK and only nulls converted_project_id on project delete', async () => {
      const ownerA = await createTestUser(database, 'owner-a-est@example.test');
      const ownerB = await createTestUser(database, 'owner-b-est@example.test');
      const orgA = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerA.id, {
          name: 'Est A',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const orgB = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerB.id, {
          name: 'Est B',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const clientB = await database.asUser(ownerB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerB.id,
          organizationId: orgB,
          locale: 'en',
        });
        return createClient(context, { name: 'Foreign Client' });
      });

      await database.asUser(ownerA.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO estimates (organization_id, client_id, title, currency)
            VALUES (${orgA}::uuid, ${clientB.id}::uuid, 'Cross', 'ILS')
          `),
        ).rejects.toThrow();
      });

      const projectId = await database.asUser(ownerA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerA.id,
          organizationId: orgA,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Converted job' });
        return created.projectId;
      });

      const estimateId = await database.asUser(ownerA.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO estimates (
              organization_id, title, currency, status, converted_project_id
            ) VALUES (
              ${orgA}::uuid, 'Quote', 'ILS', 'converted', ${projectId}::uuid
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asService(async (db) => {
        await db.execute(sql`DELETE FROM projects WHERE id = ${projectId}::uuid`);
      });

      const after = await database.asService(async (db) =>
        resultRows<{ converted_project_id: string | null; organization_id: string }>(
          await db.execute(sql`
            SELECT converted_project_id, organization_id FROM estimates WHERE id = ${estimateId}::uuid
          `),
        ),
      );
      expect(after[0]?.converted_project_id).toBeNull();
      expect(after[0]?.organization_id).toBe(orgA);
    });

    it('restricts form submitters to own drafts and freezes submitted history', async () => {
      const owner = await createTestUser(database, 'owner-form@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Forms Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const worker = await onboardRole(
        database,
        owner.id,
        organizationId,
        'worker-form@example.test',
        'worker',
      );
      const worker2 = await onboardRole(
        database,
        owner.id,
        organizationId,
        'worker2-form@example.test',
        'worker',
      );

      const projectId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Site' });
        return created.projectId;
      });

      const templateId = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO form_templates (organization_id, name, schema_json)
            VALUES (${organizationId}::uuid, 'Checklist', '{"fields":[]}'::jsonb)
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      const submissionId = await database.asUser(worker.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO form_submissions (
              organization_id, template_id, owner_type, owner_id, status,
              submitted_by_user_id, answers_json
            ) VALUES (
              ${organizationId}::uuid, ${templateId}::uuid, 'project', ${projectId}::uuid,
              'draft', ${worker.id}::uuid, '{}'::jsonb
            )
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      await database.asUser(worker2.id, async (tx) => {
        await tx.execute(sql`
          UPDATE form_submissions SET answers_json = '{"hack":true}'::jsonb
          WHERE id = ${submissionId}::uuid
        `);
      });
      const afterOther = await database.asService(async (db) =>
        resultRows<{ answers_json: unknown }>(
          await db.execute(sql`
            SELECT answers_json FROM form_submissions WHERE id = ${submissionId}::uuid
          `),
        ),
      );
      expect(afterOther[0]?.answers_json).toEqual({});

      await database.asUser(worker.id, async (tx) => {
        await tx.execute(sql`
          UPDATE form_submissions
          SET status = 'submitted', submitted_at = now(), acknowledgement_name = 'Worker'
          WHERE id = ${submissionId}::uuid
        `);
        await expect(
          tx.execute(sql`
            UPDATE form_submissions SET acknowledgement_name = 'Rewritten'
            WHERE id = ${submissionId}::uuid
          `),
        ).rejects.toThrow();
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`DELETE FROM form_templates WHERE id = ${templateId}::uuid`),
        ).rejects.toThrow();
      });
    });

    it('blocks budget history mutation and kind-mismatched recurring drafts', async () => {
      const owner = await createTestUser(database, 'owner-bud@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Budget Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const finance = await onboardRole(
        database,
        owner.id,
        organizationId,
        'finance-bud@example.test',
        'finance',
      );

      const projectId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Budgeted' });
        return created.projectId;
      });

      const budget = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO project_budgets (organization_id, project_id, name, status, currency, total_budget_amount)
            VALUES (${organizationId}::uuid, ${projectId}::uuid, 'Budget', 'active', 'ILS', 1000)
            RETURNING id
          `),
        );
        const budgetId = inserted[0]!.id;
        await tx.execute(sql`
          INSERT INTO project_budget_revisions (organization_id, budget_id, revision_number, reason, snapshot_total_amount)
          VALUES (${organizationId}::uuid, ${budgetId}::uuid, 1, 'Initial', 1000)
        `);
        await tx.execute(sql`
          INSERT INTO project_budget_lines (organization_id, budget_id, revision_number, label, budget_amount)
          VALUES (${organizationId}::uuid, ${budgetId}::uuid, 1, 'Total', 1000)
        `);
        return budgetId;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            UPDATE project_budget_revisions SET reason = 'rewritten' WHERE budget_id = ${budget}::uuid
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            DELETE FROM project_budget_lines WHERE budget_id = ${budget}::uuid
          `),
        ).rejects.toThrow();
      });

      await database.asUser(finance.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO recurring_financial_drafts (
              organization_id, draft_kind, title, frequency, next_run_date, payload_json
            ) VALUES (
              ${organizationId}::uuid, 'vendor_bill', 'AP template', 'monthly', '2026-09-01', '{}'::jsonb
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('rejects invalid year_month and interval constraints', async () => {
      const owner = await createTestUser(database, 'owner-chk@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Check Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO month_close_periods (organization_id, year_month)
            VALUES (${organizationId}::uuid, '2026-13')
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            INSERT INTO recurrence_definitions (
              organization_id, title, frequency, interval_count, start_date
            ) VALUES (
              ${organizationId}::uuid, 'Bad', 'weekly', 0, '2026-01-01'
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('blocks deleting a history-bearing budget parent and freezes identity', async () => {
      const owner = await createTestUser(database, 'owner-bud-parent@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Budget Parent Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const projectId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Budgeted job' });
        return created.projectId;
      });
      const otherProjectId = await database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Other job' });
        return created.projectId;
      });

      const budgetId = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO project_budgets (
              organization_id, project_id, name, status, currency, total_budget_amount
            ) VALUES (
              ${organizationId}::uuid, ${projectId}::uuid, 'Budget', 'active', 'ILS', 1000
            )
            RETURNING id
          `),
        );
        const id = inserted[0]!.id;
        await tx.execute(sql`
          INSERT INTO project_budget_revisions (
            organization_id, budget_id, revision_number, reason, snapshot_total_amount
          ) VALUES (
            ${organizationId}::uuid, ${id}::uuid, 1, 'Initial', 1000
          )
        `);
        await tx.execute(sql`
          INSERT INTO project_budget_lines (
            organization_id, budget_id, revision_number, label, budget_amount
          ) VALUES (
            ${organizationId}::uuid, ${id}::uuid, 1, 'Total', 1000
          )
        `);
        return id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`DELETE FROM project_budgets WHERE id = ${budgetId}::uuid`),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            UPDATE project_budgets
            SET project_id = ${otherProjectId}::uuid
            WHERE id = ${budgetId}::uuid
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            UPDATE project_budgets SET currency = 'USD' WHERE id = ${budgetId}::uuid
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            UPDATE project_budgets
            SET total_budget_amount = 1
            WHERE id = ${budgetId}::uuid
          `),
        ).rejects.toThrow();
      });

      const remaining = await database.asService(async (db) =>
        resultRows<{ revisions: number; lines: number }>(
          await db.execute(sql`
            SELECT
              (SELECT count(*)::int FROM project_budget_revisions WHERE budget_id = ${budgetId}::uuid) AS revisions,
              (SELECT count(*)::int FROM project_budget_lines WHERE budget_id = ${budgetId}::uuid) AS lines
          `),
        ),
      );
      expect(remaining[0]?.revisions).toBe(1);
      expect(remaining[0]?.lines).toBe(1);
    });

    it('scopes gate helpers by entity type and lets a domain-only role submit with rule_id', async () => {
      const owner = await createTestUser(database, 'owner-gate-bleed@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'Gate Bleed Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const quotesOnly = await onboardCustomRole(
        database,
        organizationId,
        'quotes-only@example.test',
        'quotes_only',
        ['quotes.manage'],
      );
      const expenseOnly = await onboardCustomRole(
        database,
        organizationId,
        'expense-only@example.test',
        'expense_only',
        ['expenses.finalize'],
      );

      const ids = await database.asUser(owner.id, async (tx) => {
        const bill = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO approval_rules (
              organization_id, name, entity_type, threshold_amount, currency, enabled
            ) VALUES (
              ${organizationId}::uuid, 'Bill gate', 'vendor_bill', 100, 'ILS', true
            )
            RETURNING id
          `),
        );
        const quote = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO approval_rules (
              organization_id, name, entity_type, threshold_amount, currency, enabled
            ) VALUES (
              ${organizationId}::uuid, 'Quote gate', 'quote_discount', 50, 'ILS', true
            )
            RETURNING id
          `),
        );
        const expense = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO approval_rules (
              organization_id, name, entity_type, threshold_amount, currency, enabled
            ) VALUES (
              ${organizationId}::uuid, 'Expense gate', 'expense', 10, 'ILS', true
            )
            RETURNING id
          `),
        );
        return { billRuleId: bill[0]!.id, quoteRuleId: quote[0]!.id, expenseRuleId: expense[0]!.id };
      });

      const quotesSeesBills = await database.asUser(quotesOnly.id, async (tx) =>
        resultRows(
          await tx.execute(sql`
            SELECT * FROM app.enabled_approval_rules_for_gate(${organizationId}::uuid, 'vendor_bill')
          `),
        ),
      );
      expect(quotesSeesBills).toEqual([]);

      const quotesSeesQuotes = await database.asUser(quotesOnly.id, async (tx) =>
        resultRows(
          await tx.execute(sql`
            SELECT * FROM app.enabled_approval_rules_for_gate(${organizationId}::uuid, 'quote_discount')
          `),
        ),
      );
      expect(quotesSeesQuotes).toHaveLength(1);

      const rulesLeak = await database.asUser(expenseOnly.id, async (tx) =>
        resultRows(
          await tx.execute(sql`SELECT id FROM approval_rules WHERE organization_id = ${organizationId}::uuid`),
        ),
      );
      expect(rulesLeak).toEqual([]);

      await database.asUser(expenseOnly.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO approval_requests (
              organization_id, rule_id, entity_type, entity_id, amount, currency,
              status, submitted_by_user_id
            ) VALUES (
              ${organizationId}::uuid, ${ids.expenseRuleId}::uuid, 'expense', gen_random_uuid(),
              20, 'ILS', 'submitted', ${expenseOnly.id}::uuid
            )
            RETURNING id
          `),
        );
        expect(inserted).toHaveLength(1);
        await expect(
          tx.execute(sql`
            INSERT INTO approval_requests (
              organization_id, rule_id, entity_type, entity_id, amount, currency,
              status, submitted_by_user_id
            ) VALUES (
              ${organizationId}::uuid, ${ids.billRuleId}::uuid, 'vendor_bill', gen_random_uuid(),
              20, 'ILS', 'submitted', ${expenseOnly.id}::uuid
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('validates field_log form owners against daily_logs, not projects', async () => {
      const ownerA = await createTestUser(database, 'owner-flog-a@example.test');
      const ownerB = await createTestUser(database, 'owner-flog-b@example.test');
      const orgA = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerA.id, {
          name: 'Field Log A',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const orgB = await database.asService(async (db) => {
        const created = await createOrganization(db, ownerB.id, {
          name: 'Field Log B',
          countryCode: 'IL',
        });
        return created.organization.id;
      });
      const worker = await onboardRole(
        database,
        ownerA.id,
        orgA,
        'worker-flog@example.test',
        'worker',
      );

      const projectA = await database.asUser(ownerA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerA.id,
          organizationId: orgA,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Site A' });
        return created.projectId;
      });
      const logA = await database.asUser(ownerA.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO daily_logs (organization_id, project_id, log_date, summary)
            VALUES (${orgA}::uuid, ${projectA}::uuid, '2026-08-11', 'Crew on site')
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });
      const logB = await database.asUser(ownerB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: ownerB.id,
          organizationId: orgB,
          locale: 'en',
        });
        const created = await createProject(context, { name: 'Site B' });
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO daily_logs (organization_id, project_id, log_date, summary)
            VALUES (${orgB}::uuid, ${created.projectId}::uuid, '2026-08-11', 'Other crew')
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });
      const templateId = await database.asUser(ownerA.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO form_templates (organization_id, name, schema_json)
            VALUES (${orgA}::uuid, 'Daily checklist', '{"fields":[]}'::jsonb)
            RETURNING id
          `),
        );
        return inserted[0]!.id;
      });

      const ok = await database.asUser(worker.id, async (tx) =>
        resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO form_submissions (
              organization_id, template_id, owner_type, owner_id, status,
              submitted_by_user_id, answers_json
            ) VALUES (
              ${orgA}::uuid, ${templateId}::uuid, 'field_log', ${logA}::uuid,
              'draft', ${worker.id}::uuid, '{}'::jsonb
            )
            RETURNING id
          `),
        ),
      );
      expect(ok).toHaveLength(1);

      await database.asUser(worker.id, async (tx) => {
        await expect(
          tx.execute(sql`
            INSERT INTO form_submissions (
              organization_id, template_id, owner_type, owner_id, status,
              submitted_by_user_id, answers_json
            ) VALUES (
              ${orgA}::uuid, ${templateId}::uuid, 'field_log', ${projectA}::uuid,
              'draft', ${worker.id}::uuid, '{}'::jsonb
            )
          `),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            INSERT INTO form_submissions (
              organization_id, template_id, owner_type, owner_id, status,
              submitted_by_user_id, answers_json
            ) VALUES (
              ${orgA}::uuid, ${templateId}::uuid, 'field_log', ${logB}::uuid,
              'draft', ${worker.id}::uuid, '{}'::jsonb
            )
          `),
        ).rejects.toThrow();
      });
    });

    it('preserves recurrence occurrence history and stamps month-close identity', async () => {
      const owner = await createTestUser(database, 'owner-hist@example.test');
      const forged = await createTestUser(database, 'forged-closer@example.test');
      const organizationId = await database.asService(async (db) => {
        const created = await createOrganization(db, owner.id, {
          name: 'History Org',
          countryCode: 'IL',
        });
        return created.organization.id;
      });

      const definitionId = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO recurrence_definitions (
              organization_id, title, frequency, interval_count, start_date
            ) VALUES (
              ${organizationId}::uuid, 'Weekly service', 'weekly', 1, '2026-08-01'
            )
            RETURNING id
          `),
        );
        const id = inserted[0]!.id;
        await tx.execute(sql`
          INSERT INTO recurrence_occurrences (
            organization_id, recurrence_definition_id, occurrence_date, status
          ) VALUES (
            ${organizationId}::uuid, ${id}::uuid, '2026-08-08', 'generated'
          )
        `);
        return id;
      });

      await database.asUser(owner.id, async (tx) => {
        await expect(
          tx.execute(sql`DELETE FROM recurrence_definitions WHERE id = ${definitionId}::uuid`),
        ).rejects.toThrow();
        await expect(
          tx.execute(sql`
            DELETE FROM recurrence_occurrences
            WHERE recurrence_definition_id = ${definitionId}::uuid
          `),
        ).rejects.toThrow();
      });

      const stillThere = await database.asService(async (db) =>
        resultRows<{ count: number }>(
          await db.execute(sql`
            SELECT count(*)::int AS count
            FROM recurrence_occurrences
            WHERE recurrence_definition_id = ${definitionId}::uuid
          `),
        ),
      );
      expect(stillThere[0]?.count).toBe(1);

      const closed = await database.asUser(owner.id, async (tx) => {
        const inserted = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_periods (organization_id, year_month)
            VALUES (${organizationId}::uuid, '2026-07')
            RETURNING id
          `),
        );
        const id = inserted[0]!.id;
        await tx.execute(sql`
          UPDATE month_close_periods SET status = 'ready' WHERE id = ${id}::uuid
        `);
        await tx.execute(sql`
          UPDATE month_close_periods
          SET status = 'closed', closed_by_user_id = ${forged.id}::uuid
          WHERE id = ${id}::uuid
        `);
        const rows = resultRows<{ closed_by_user_id: string }>(
          await tx.execute(sql`
            SELECT closed_by_user_id FROM month_close_periods WHERE id = ${id}::uuid
          `),
        );
        expect(rows[0]?.closed_by_user_id).toBe(owner.id);
        const adj = resultRows<{ created_by_user_id: string }>(
          await tx.execute(sql`
            INSERT INTO month_close_adjustments (
              organization_id, period_id, reason, created_by_user_id
            ) VALUES (
              ${organizationId}::uuid, ${id}::uuid, 'Post-close note', ${forged.id}::uuid
            )
            RETURNING created_by_user_id
          `),
        );
        expect(adj[0]?.created_by_user_id).toBe(owner.id);
        return id;
      });
      expect(closed).toBeTruthy();
    });
  });
});
