import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';

/**
 * Disposable PGlite check for 0021 workforce contacts + allocations.
 * Does not touch owner Supabase. Never run db:migrate against production here.
 */
describe('0021 workforce contacts and allocations integrity (PGlite)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates safe contact FK, temporal assignments, and allocation tables', async () => {
    await database.asService(async (db) => {
      const indexes = resultRows<{ indexname: string }>(
        await db.execute(sql`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (
              'client_contacts_id_organization_id_uq',
              'employees_id_organization_id_uq',
              'projects_primary_contact_idx',
              'employee_project_assignments_id_organization_id_uq',
              'employee_project_assignments_org_project_start_idx',
              'employee_month_costs_active_org_employee_month_uq',
              'labor_allocation_runs_one_applied_per_month_uq',
              'ap_bill_project_allocations_bill_project_active_uq'
            )
          ORDER BY indexname
        `),
      ).map((row) => row.indexname);

      expect(indexes).toEqual([
        'ap_bill_project_allocations_bill_project_active_uq',
        'client_contacts_id_organization_id_uq',
        'employee_month_costs_active_org_employee_month_uq',
        'employee_project_assignments_id_organization_id_uq',
        'employee_project_assignments_org_project_start_idx',
        'employees_id_organization_id_uq',
        'labor_allocation_runs_one_applied_per_month_uq',
        'projects_primary_contact_idx',
      ]);

      const columns = resultRows<{ column_name: string }>(
        await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'projects'
            AND column_name = 'primary_contact_id'
        `),
      );
      expect(columns).toHaveLength(1);

      const fks = resultRows<{ conname: string }>(
        await db.execute(sql`
          SELECT conname FROM pg_constraint
          WHERE conname IN (
            'projects_primary_contact_id_fk',
            'employee_project_assignments_project_org_fk',
            'employee_project_assignments_employee_org_fk'
          )
          ORDER BY conname
        `),
      ).map((row) => row.conname);

      expect(fks).toEqual([
        'employee_project_assignments_employee_org_fk',
        'employee_project_assignments_project_org_fk',
        'projects_primary_contact_id_fk',
      ]);

      // SAFE contact FK is single-column on primary_contact_id only.
      const fkCols = resultRows<{ attname: string }>(
        await db.execute(sql`
          SELECT a.attname
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.conname = 'projects_primary_contact_id_fk'
          ORDER BY a.attnum
        `),
      ).map((row) => row.attname);
      expect(fkCols).toEqual(['primary_contact_id']);

      const triggers = resultRows<{ tgname: string }>(
        await db.execute(sql`
          SELECT tgname FROM pg_trigger
          WHERE tgname IN (
            'projects_primary_contact_client_guard',
            'client_contacts_clear_project_refs',
            'employee_project_assignments_no_overlap',
            'labor_allocation_runs_conservation_guard'
          )
          ORDER BY tgname
        `),
      ).map((row) => row.tgname);
      expect(triggers).toEqual([
        'client_contacts_clear_project_refs',
        'employee_project_assignments_no_overlap',
        'labor_allocation_runs_conservation_guard',
        'projects_primary_contact_client_guard',
      ]);

      const rls = resultRows<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        await db.execute(sql`
          SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN (
              'employee_project_assignments',
              'employee_month_costs',
              'labor_allocation_runs',
              'labor_allocation_run_lines',
              'ap_bill_project_allocations'
            )
          ORDER BY c.relname
        `),
      );
      expect(rls.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
      expect(rls).toHaveLength(5);
    });
  });

  it('rejects project contact from a different client; allows per-project contacts', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('QA Org 0021', 'ILS')
          RETURNING id
        `),
      )[0]!;

      const clients = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO clients (organization_id, name)
          VALUES
            (${org.id}, 'ABC Ltd'),
            (${org.id}, 'Other Co')
          RETURNING id
        `),
      );
      const clientA = clients[0]!.id;
      const clientB = clients[1]!.id;

      const contacts = resultRows<{ id: string; name: string }>(
        await db.execute(sql`
          INSERT INTO client_contacts (organization_id, client_id, name, phone)
          VALUES
            (${org.id}, ${clientA}, 'Yossi', '050'),
            (${org.id}, ${clientA}, 'Dani', '052'),
            (${org.id}, ${clientB}, 'Other', '053')
          RETURNING id, name
        `),
      );
      const yossi = contacts.find((c) => c.name === 'Yossi')!.id;
      const dani = contacts.find((c) => c.name === 'Dani')!.id;
      const other = contacts.find((c) => c.name === 'Other')!.id;

      const projects = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name, client_id, primary_contact_id)
          VALUES
            (${org.id}, 'Project A', ${clientA}, ${yossi}),
            (${org.id}, 'Project B', ${clientA}, ${dani})
          RETURNING id
        `),
      );
      expect(projects).toHaveLength(2);

      await expect(
        db.execute(sql`
          UPDATE projects
          SET primary_contact_id = ${other}
          WHERE id = ${projects[0]!.id}
        `),
      ).rejects.toThrow(/projects_primary_contact_client_mismatch|23514|Failed query/);
    });
  });

  it('safe contact delete clears primary_contact_id and leaves organization_id intact', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('QA Contact Delete Org', 'ILS')
          RETURNING id
        `),
      )[0]!;

      const client = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO clients (organization_id, name)
          VALUES (${org.id}, 'Client Safe Delete')
          RETURNING id
        `),
      )[0]!;

      const contact = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO client_contacts (organization_id, client_id, name, phone)
          VALUES (${org.id}, ${client.id}, 'To Delete', '050')
          RETURNING id
        `),
      )[0]!;

      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name, client_id, primary_contact_id)
          VALUES (${org.id}, 'Contact Project', ${client.id}, ${contact.id})
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`DELETE FROM client_contacts WHERE id = ${contact.id}`);

      const after = resultRows<{ organization_id: string; primary_contact_id: string | null }>(
        await db.execute(sql`
          SELECT organization_id, primary_contact_id
          FROM projects
          WHERE id = ${project.id}
        `),
      )[0]!;

      expect(after.organization_id).toBe(org.id);
      expect(after.primary_contact_id).toBeNull();
    });
  });

  it('enforces non-overlapping temporal assignments for same employee+project', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('QA Team Org', 'ILS')
          RETURNING id
        `),
      )[0]!;

      const project = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO projects (organization_id, name)
          VALUES (${org.id}, 'Team Project')
          RETURNING id
        `),
      )[0]!;

      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}, 'Worker One')
          RETURNING id
        `),
      )[0]!;

      await db.execute(sql`
        INSERT INTO employee_project_assignments (
          organization_id, project_id, employee_id, start_date, status
        )
        VALUES (${org.id}, ${project.id}, ${employee.id}, '2026-01-01', 'active')
      `);

      await expect(
        db.execute(sql`
          INSERT INTO employee_project_assignments (
            organization_id, project_id, employee_id, start_date, status
          )
          VALUES (${org.id}, ${project.id}, ${employee.id}, '2026-02-01', 'active')
        `),
      ).rejects.toThrow(/employee_project_assignments_overlap|23P01|Failed query/i);
    });
  });

  it('enforces labor allocation conservation when applied', async () => {
    await database.asService(async (db) => {
      const org = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organizations (name, base_currency)
          VALUES ('QA Labor Alloc Org', 'ILS')
          RETURNING id
        `),
      )[0]!;

      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name)
          VALUES (${org.id}, 'Costed Worker')
          RETURNING id
        `),
      )[0]!;

      const month = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employee_month_costs (
            organization_id, employee_id, year_month, currency, known_amount
          )
          VALUES (${org.id}, ${employee.id}, '2026-03', 'ILS', 1000)
          RETURNING id
        `),
      )[0]!;

      await expect(
        db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          )
          VALUES (
            ${org.id}, ${month.id}, 'manual_override', 'applied',
            'ILS', 600, 300
          )
        `),
      ).rejects.toThrow(/labor_allocation_runs_conservation_failed|23514|Failed query/i);

      // allocated + unallocated = known, and line_sum (0) = allocated (0).
      const ok = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO labor_allocation_runs (
            organization_id, employee_month_cost_id, method, status,
            currency, allocated_amount, unallocated_amount
          )
          VALUES (
            ${org.id}, ${month.id}, 'manual_override', 'applied',
            'ILS', 0, 1000
          )
          RETURNING id
        `),
      );
      expect(ok).toHaveLength(1);
    });
  });
});

describe('0021 disposable upgrade from 0020 (PGlite)', () => {
  it('applies 0021 alone onto a DB that already has 0000–0020', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0020_overnight_foundations');
      const sql0021 = await readFile(
        path.join(process.cwd(), 'drizzle/migrations', '0021_workforce_contacts_and_allocations.sql'),
        'utf8',
      );
      for (const statement of splitSqlStatements(sql0021.replaceAll('--> statement-breakpoint', ''))) {
        await client.exec(statement);
      }

      const check = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'primary_contact_id'
      ) AS exists
    `);
      expect(check.rows[0]?.exists).toBe(true);

      const assignments = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'employee_project_assignments'
      ) AS exists
    `);
      expect(assignments.rows[0]?.exists).toBe(true);

      const allocations = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ap_bill_project_allocations'
      ) AS exists
    `);
      expect(allocations.rows[0]?.exists).toBe(true);
    });
  });
});
