import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  applyVendorCredit,
  createApBill,
  createVendorCredit,
  postVendorCredit,
  enableApPaymentsPersistenceForTests,
  disableApPaymentsPersistenceForTests,
} from '@/modules/ap';
import { createEmployee } from '@/modules/workforce';
import { createProject } from '@/modules/projects';
import { createVendor } from '@/modules/vendors';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  acceptInvitation,
  createInvitation,
} from '@/modules/tenancy';
import {
  applySqlMigrations,
  createTestDatabase,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../billing/setup';
import {
  applyMigrationsAndAgent1Patch,
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from '../pre0021/two-connection';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const ILS = 'ILS';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

describe('migration hardening 0022+0023', () => {
  describe('SQL identity + journal content', () => {
    it('0022 uses tenant-safe correction and credit project FKs + immutability guards', async () => {
      const sql022 = await readFile(
        path.join(MIGRATIONS_DIR, '0022_master_completion_foundations.sql'),
        'utf8',
      );
      expect(sql022).toContain('time_entries_id_organization_id_uq');
      expect(sql022).toContain('time_entries_corrects_entry_org_fk');
      expect(sql022).toContain('FOREIGN KEY ("corrects_entry_id", "organization_id")');
      expect(sql022).toContain('ap_vendor_credits_project_org_fk');
      expect(sql022).toContain('FOREIGN KEY ("project_id", "organization_id")');
      expect(sql022).toContain('ap_vendor_credits_guard');
      expect(sql022).toContain('ap_credit_applications_guard');
    expect(sql022).toContain('ap_credit_applications_conservation');
    expect(sql022).toContain('time_entries_corrects_entry_org_fk');
    expect(sql022).not.toContain('FOREIGN KEY ("corrects_entry_id")\n      REFERENCES public.time_entries ("id")');
    expect(sql022).not.toContain('FOREIGN KEY ("project_id")\n      REFERENCES public.projects ("id")');
    });

    it('0023 attendance SELECT does not grant org-wide access via workforce.read', async () => {
      const sql023 = await readFile(
        path.join(MIGRATIONS_DIR, '0023_attendance_rls_and_role_backfill.sql'),
        'utf8',
      );
      expect(sql023).toContain('linked_employee_id');
      expect(sql023).toContain("'attendance.self'");
      expect(sql023).not.toMatch(/VARIADIC ARRAY\[[^\]]*workforce\.read/);
    });
  });

  describe('clean start and 0021→0022→0023 upgrade', () => {
    it('clean-starts through 0023', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client);
        const credits = await client.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'ap_vendor_credits'`,
        );
        const linked = await client.query(
          `SELECT 1 FROM pg_proc WHERE proname = 'linked_employee_id'`,
        );
        expect(credits.rows.length).toBe(1);
        expect(linked.rows.length).toBe(1);
      });
    });

    it('upgrades 0021 → 0022 → 0023', async () => {
      await withRawPglite(async (client) => {
        await applySqlMigrations(client, '0021_workforce_contacts_and_allocations');
        for (const file of [
          '0022_master_completion_foundations.sql',
          '0023_attendance_rls_and_role_backfill.sql',
        ]) {
          const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
          for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
            await client.exec(statement);
          }
        }
        const fk = await client.query(
          `SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_corrects_entry_org_fk'`,
        );
        const projectFk = await client.query(
          `SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_project_org_fk'`,
        );
        const linked = await client.query(
          `SELECT 1 FROM pg_proc WHERE proname = 'linked_employee_id'`,
        );
        expect(fk.rows.length).toBe(1);
        expect(projectFk.rows.length).toBe(1);
        expect(linked.rows.length).toBe(1);
      });
    });
  });
});

describe('AP credit hardening (tenant FK + immutability + concurrency)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    enableApPaymentsPersistenceForTests();
  });

  afterAll(async () => {
    disableApPaymentsPersistenceForTests();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    enableApPaymentsPersistenceForTests();
  });

  it('rejects credit project_id from another organization', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const projectB = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return createProject(context, { name: 'Foreign Project' });
    });

    const vendorId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Local Vendor' });
      return vendor.id;
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO ap_vendor_credits (
            organization_id, vendor_id, project_id, credit_date, currency, amount, status
          ) VALUES (
            ${orgA.organization.id}::uuid,
            ${vendorId}::uuid,
            ${projectB.projectId}::uuid,
            '2026-08-01',
            'ILS',
            1000,
            'open'
          )
        `);
      }),
    ).rejects.toSatisfy((error) =>
      /foreign key|ap_vendor_credits_project_org_fk|violates/i.test(errorBlob(error)),
    );
  });

  it('allows draft/open edit; blocks applied amount rewrite and hard delete; allows void', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { creditId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Credit Vendor' });
      const materialsId = (
        await tx.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id = ${orgA.organization.id}::uuid AND key = 'materials' LIMIT 1
        `)
      );
      const categoryRows = Array.isArray(materialsId)
        ? materialsId
        : ((materialsId as { rows?: { id: string }[] }).rows ?? []);
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: ILS,
        totalAmount: '10000',
        billDate: '2026-08-01',
        dueDate: '2026-09-01',
        lines: [
          {
            description: 'Line',
            quantity: '1',
            unitAmount: '10000',
            lineTotal: '10000',
            currency: ILS,
            costCategoryId: categoryRows[0]!.id,
            costFamily: 'direct_project',
          },
        ],
      });
      const credit = await createVendorCredit(context, {
        vendorId: vendor.id,
        amount: '1000',
        currency: ILS,
        creditDate: '2026-08-02',
      });
      // Draft edit allowed
      await tx.execute(sql`
        UPDATE ap_vendor_credits SET amount = 1500, notes = 'adjusted'
        WHERE id = ${credit.id}::uuid AND organization_id = ${orgA.organization.id}::uuid
      `);
      await postVendorCredit(context, credit.id);
      await applyVendorCredit(context, {
        creditId: credit.id,
        apBillId: bill.id,
        amount: '1500',
      });
      return { creditId: credit.id, billId: bill.id };
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          UPDATE ap_vendor_credits SET amount = 999
          WHERE id = ${creditId}::uuid
        `);
      }),
    ).rejects.toSatisfy((error) => /immutable|restrict/i.test(errorBlob(error)));

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          DELETE FROM ap_vendor_credits WHERE id = ${creditId}::uuid
        `);
      }),
    ).rejects.toSatisfy((error) => /hard-deleted|restrict|immutable/i.test(errorBlob(error)));

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE ap_vendor_credits
        SET status = 'void', voided_at = now()
        WHERE id = ${creditId}::uuid
      `);
    });

    const voided = await database.asService(async (db) => {
      const rows = await db.execute(sql`
        SELECT status FROM ap_vendor_credits WHERE id = ${creditId}::uuid
      `);
      return rows;
    });
    const statusRows = Array.isArray(voided)
      ? voided
      : ((voided as { rows?: { status: string }[] }).rows ?? []);
    expect(statusRows[0]).toMatchObject({ status: 'void' });
  });

  it('rejects time_entries.corrects_entry_id across organizations', async () => {
    const { orgA, orgB } = await provisionTwoTenants(database);

    const entryB = await database.asService(async (db) => {
      const emp = await db.execute(sql`
        INSERT INTO employees (organization_id, name, status)
        VALUES (${orgB.organization.id}::uuid, 'B Worker', 'active')
        RETURNING id
      `);
      const empRows = Array.isArray(emp) ? emp : ((emp as { rows?: { id: string }[] }).rows ?? []);
      const employeeId = empRows[0]!.id as string;
      const inserted = await db.execute(sql`
        INSERT INTO time_entries (
          organization_id, employee_id, work_date, hours, kind, status
        ) VALUES (
          ${orgB.organization.id}::uuid,
          ${employeeId}::uuid,
          '2026-08-01',
          8,
          'non_project',
          'recorded'
        )
        RETURNING id
      `);
      const rows = Array.isArray(inserted)
        ? inserted
        : ((inserted as { rows?: { id: string }[] }).rows ?? []);
      return rows[0]!.id as string;
    });

    await expect(
      database.asService(async (db) => {
        const emp = await db.execute(sql`
          INSERT INTO employees (organization_id, name, status)
          VALUES (${orgA.organization.id}::uuid, 'A Worker', 'active')
          RETURNING id
        `);
        const empRows = Array.isArray(emp) ? emp : ((emp as { rows?: { id: string }[] }).rows ?? []);
        const employeeId = empRows[0]!.id as string;
        await db.execute(sql`
          INSERT INTO time_entries (
            organization_id, employee_id, work_date, hours, kind, status, corrects_entry_id
          ) VALUES (
            ${orgA.organization.id}::uuid,
            ${employeeId}::uuid,
            '2026-08-02',
            8,
            'non_project',
            'recorded',
            ${entryB}::uuid
          )
        `);
      }),
    ).rejects.toSatisfy((error) =>
      /foreign key|corrects_entry_org_fk|violates/i.test(errorBlob(error)),
    );
  });
});

describe('AP credit concurrency conservation (two connections)', () => {
  it('does not over-apply a single credit under concurrent inserts', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applyMigrationsAndAgent1Patch(client);
    });

    try {
      const orgId = (
        await harness.sqlA`
          INSERT INTO organizations (name, base_currency)
          VALUES ('Conc Org', 'ILS')
          RETURNING id
        `
      )[0]!.id as string;

      const vendorId = (
        await harness.sqlA`
          INSERT INTO vendors (id, organization_id, name)
          VALUES (gen_random_uuid(), ${orgId}::uuid, 'V')
          RETURNING id
        `
      )[0]!.id as string;

      const materialsId = randomUUID();
      await harness.sqlA`
        INSERT INTO cost_categories (id, organization_id, key, name, family, is_system, sort_order)
        VALUES (${materialsId}::uuid, ${orgId}::uuid, 'materials', 'Materials', 'direct_project', true, 1)
      `;

      const billId = (
        await harness.sqlA`
          INSERT INTO ap_bills (
            id, organization_id, vendor_id, currency, total_amount, net_amount, tax_amount, gross_amount,
            bill_date, status
          ) VALUES (
            gen_random_uuid(), ${orgId}::uuid, ${vendorId}::uuid, 'ILS', 100000, 100000, 0, 100000,
            '2026-08-01', 'draft'
          )
          RETURNING id
        `
      )[0]!.id as string;

      await harness.sqlA`
        INSERT INTO ap_bill_lines (
          organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
          net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
        ) VALUES (
          ${orgId}::uuid, ${billId}::uuid, 'Materials', 1, 100000, 100000,
          100000, 0, 100000, 'ILS', 'classified', ${materialsId}::uuid, 1
        )
      `;
      await harness.sqlA`
        UPDATE ap_bills SET status = 'open' WHERE id = ${billId}::uuid
      `;

      const creditId = (
        await harness.sqlA`
          INSERT INTO ap_vendor_credits (
            id, organization_id, vendor_id, credit_date, currency, amount, status
          ) VALUES (
            gen_random_uuid(), ${orgId}::uuid, ${vendorId}::uuid, '2026-08-01', 'ILS', 1000, 'open'
          )
          RETURNING id
        `
      )[0]!.id as string;

      const results = await Promise.allSettled([
        harness.sqlA.begin(async (tx) => {
          await tx`
            INSERT INTO ap_credit_applications (
              organization_id, credit_id, ap_bill_id, amount, currency, status
            ) VALUES (
              ${orgId}::uuid, ${creditId}::uuid, ${billId}::uuid, 800, 'ILS', 'applied'
            )
          `;
        }),
        harness.sqlB.begin(async (tx) => {
          await tx`
            INSERT INTO ap_credit_applications (
              organization_id, credit_id, ap_bill_id, amount, currency, status
            ) VALUES (
              ${orgId}::uuid, ${creditId}::uuid, ${billId}::uuid, 800, 'ILS', 'applied'
            )
          `;
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toBeLessThanOrEqual(1);
      expect(fulfilled + rejected.length).toBe(2);
      for (const result of rejected) {
        expect(
          isIntegrityFailure(result.reason, 'exceeds credit remaining') ||
            isIntegrityFailure(result.reason, 'check_violation') ||
            isContendedConnectionError(result.reason) ||
            /exceeds|check/i.test(String(result.reason)),
        ).toBe(true);
      }

      const sumRows = await harness.sqlA`
        SELECT COALESCE(SUM(amount), 0)::text AS sum
        FROM ap_credit_applications
        WHERE credit_id = ${creditId}::uuid AND status = 'applied'
      `;
      expect(Number(sumRows[0]?.sum ?? 9999)).toBeLessThanOrEqual(1000);
    } finally {
      await harness.close();
    }
  }, 60_000);
});

describe('attendance RLS role separation', () => {
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

  it('default Worker sees own attendance only; not peers; manager sees org-wide', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'att-owner@example.test');
    const workerUser = await createTestUser(database, 'att-worker@example.test');

    const org = await database.asService(async (db) => {
      const { createOrganization } = await import('@/modules/tenancy');
      return (await createOrganization(db, owner.id, { name: 'Att Org', countryCode: 'IL' }))
        .organization;
    });

    const inviteWorker = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.id,
        locale: 'en',
      });
      return createInvitation(context, { email: workerUser.email, roleKey: 'worker' });
    });
    await database.asService((db) =>
      acceptInvitation(db, {
        token: inviteWorker.token,
        userId: workerUser.id,
        userEmail: workerUser.email,
      }),
    );

    const { workerEmployeeId, peerEmployeeId } = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.id,
        locale: 'en',
      });
      const workerEmp = await createEmployee(context, {
        name: 'Linked Worker',
        rateUnit: 'monthly',
        userId: workerUser.id,
      });
      const peerEmp = await createEmployee(context, {
        name: 'Peer Employee',
        rateUnit: 'monthly',
      });
      await tx.execute(sql`
        INSERT INTO attendance_days (organization_id, employee_id, work_date, status)
        VALUES
          (${org.id}::uuid, ${workerEmp.id}::uuid, '2026-08-10', 'open'),
          (${org.id}::uuid, ${peerEmp.id}::uuid, '2026-08-10', 'open')
      `);
      return { workerEmployeeId: workerEmp.id, peerEmployeeId: peerEmp.id };
    });

    const workerVisible = await database.asUser(workerUser.id, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT employee_id::text AS employee_id
        FROM attendance_days
        WHERE organization_id = ${org.id}::uuid
      `);
      return Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    });

    expect(workerVisible).toHaveLength(1);
    expect((workerVisible[0] as { employee_id: string }).employee_id).toBe(workerEmployeeId);

    const ownerVisible = await database.asUser(owner.id, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT employee_id::text AS employee_id
        FROM attendance_days
        WHERE organization_id = ${org.id}::uuid
        ORDER BY employee_id
      `);
      return Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    });
    expect(ownerVisible.length).toBe(2);
    const ids = ownerVisible.map((r) => (r as { employee_id: string }).employee_id);
    expect(ids).toEqual(expect.arrayContaining([workerEmployeeId, peerEmployeeId]));
  });
});
