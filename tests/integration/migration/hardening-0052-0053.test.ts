import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createApBill, createDraftApBill } from '@/modules/ap';
import { createProjectBoq, createSubcontractorSchedule } from '@/modules/boq';
import { createOpportunity } from '@/modules/crm';
import {
  createDailyLog,
  createInspection,
  createPunchListItem,
  linkDailyLogSafetyRecord,
} from '@/modules/field-ops';
import { createFormTemplate } from '@/modules/forms';
import { createProject } from '@/modules/projects';
import { createQuote } from '@/modules/quotes';
import { createSafetyRecord } from '@/modules/safety';
import { createOrganization, resolveOrgContext, saveSavedListView } from '@/modules/tenancy';
import { createSubcontract, createVendor, createVendorEngagement } from '@/modules/vendors';
import { createEmployee } from '@/modules/workforce';
import {
  applySqlMigrations,
  createTestDatabase,
  resultRows,
  splitSqlStatements,
  withRawPglite,
  type TestDatabase,
} from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

const OPTIONAL_COMPOSITE_SET_NULL = [
  { conname: 'punch_list_items_assignee_org_fk', column: 'assignee_employee_id' },
  { conname: 'inspections_inspector_org_fk', column: 'inspector_employee_id' },
  { conname: 'inspections_form_template_org_fk', column: 'form_template_id' },
  { conname: 'daily_logs_safety_org_fk', column: 'linked_safety_record_id' },
  { conname: 'boq_sub_schedules_agreement_org_fk', column: 'subcontract_agreement_id' },
  { conname: 'ap_bills_subcontract_org_fk', column: 'subcontract_agreement_id' },
  { conname: 'estimates_opportunity_org_fk', column: 'opportunity_id' },
] as const;

async function applyNamed(client: { exec: (sql: string) => Promise<unknown> }, tag: string) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    await client.exec(statement);
  }
}

async function columnExists(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  table: string,
  column: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}'`,
  );
  return result.rows.length === 1;
}

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as {
    message?: string;
    cause?: unknown;
    detail?: string;
    code?: string;
    issues?: readonly { message?: string }[];
  };
  return [e.message, e.detail, e.code, ...(e.issues ?? []).map((issue) => issue.message), errorBlob(e.cause)]
    .filter(Boolean)
    .join('\n');
}

function assertColumnSpecificSetNull(def: string, column: string) {
  expect(def).toMatch(new RegExp(`ON DELETE SET NULL\\s*\\(\\s*${column}\\s*\\)`, 'i'));
  expect(def).not.toMatch(/ON DELETE SET NULL\s*$/i);
  expect(def).not.toMatch(/ON DELETE SET NULL\s*;/i);
  expect(def.toLowerCase()).not.toMatch(/set null \(.*organization_id/);
}

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
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

function billLines(currency: string, amount: string) {
  return [
    {
      description: 'Valuation',
      quantity: '1',
      unitAmount: amount,
      lineTotal: amount,
      currency,
    },
  ];
}

describe('migration hardening 0052–0053 product completion', () => {
  it('source SQL never uses whole-row composite SET NULL', async () => {
    const files = ['0052_product_completion.sql', '0053_estimates_opportunity.sql'];
    for (const file of files) {
      const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const matches = [...raw.matchAll(/ON DELETE SET NULL(?!\s*\()/gi)];
      expect(matches, file).toHaveLength(0);
    }
  });

  it('clean-starts through 0053 with punch, numbering, subcontract, documents, saved views, estimates.opportunity', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client);

      expect(await columnExists(client, 'punch_list_items', 'assignee_employee_id')).toBe(true);
      expect(await columnExists(client, 'inspections', 'inspector_employee_id')).toBe(true);
      expect(await columnExists(client, 'inspections', 'form_template_id')).toBe(true);
      expect(await columnExists(client, 'daily_logs', 'linked_safety_record_id')).toBe(true);
      expect(await columnExists(client, 'projects', 'document_number')).toBe(true);
      expect(await columnExists(client, 'ap_bills', 'subcontract_agreement_id')).toBe(true);
      expect(await columnExists(client, 'documents', 'privacy_class')).toBe(true);
      expect(await columnExists(client, 'saved_list_views', 'id')).toBe(true);
      expect(await columnExists(client, 'estimates', 'opportunity_id')).toBe(true);

      const kinds = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conname = 'document_number_sequences_kind_known'`,
      );
      const kindDef = String((kinds.rows[0] as { def?: string } | undefined)?.def ?? '');
      expect(kindDef).toMatch(/project/);
      expect(kindDef).toMatch(/work_order/);

      for (const { conname, column } of OPTIONAL_COMPOSITE_SET_NULL) {
        const fk = await client.query(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = '${conname}'`,
        );
        expect(fk.rows.length, conname).toBe(1);
        assertColumnSpecificSetNull(String((fk.rows[0] as { def: string }).def), column);
      }

      const defaultUq = await client.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'saved_list_views_user_list_default_uq'`,
      );
      expect(defaultUq.rows.length).toBe(1);

      const unsafe = await client.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conname IN (
           'punch_list_items_assignee_org_fk',
           'inspections_inspector_org_fk',
           'inspections_form_template_org_fk',
           'daily_logs_safety_org_fk',
           'boq_sub_schedules_agreement_org_fk',
           'ap_bills_subcontract_org_fk',
           'estimates_opportunity_org_fk'
         )
           AND pg_get_constraintdef(oid) ~* 'ON DELETE SET NULL'
           AND pg_get_constraintdef(oid) !~* 'ON DELETE SET NULL\\s*\\('`,
      );
      expect(unsafe.rows).toEqual([]);
    });
  });

  it('upgrades 0051 → 0053 without rewriting 0000–0051 objects', async () => {
    await withRawPglite(async (client) => {
      await applySqlMigrations(client, '0051_review_integrity_closure');

      expect(await columnExists(client, 'punch_list_items', 'assignee_employee_id')).toBe(false);
      expect(await columnExists(client, 'estimates', 'opportunity_id')).toBe(false);
      expect(await columnExists(client, 'saved_list_views', 'id')).toBe(false);

      await applyNamed(client, '0052_product_completion');
      await applyNamed(client, '0053_estimates_opportunity');

      expect(await columnExists(client, 'punch_list_items', 'assignee_employee_id')).toBe(true);
      expect(await columnExists(client, 'projects', 'document_number')).toBe(true);
      expect(await columnExists(client, 'ap_bills', 'subcontract_agreement_id')).toBe(true);
      expect(await columnExists(client, 'documents', 'privacy_class')).toBe(true);
      expect(await columnExists(client, 'saved_list_views', 'id')).toBe(true);
      expect(await columnExists(client, 'estimates', 'opportunity_id')).toBe(true);

      for (const { conname, column } of OPTIONAL_COMPOSITE_SET_NULL) {
        const fk = await client.query(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = '${conname}'`,
        );
        expect(fk.rows.length, conname).toBe(1);
        assertColumnSpecificSetNull(String((fk.rows[0] as { def: string }).def), column);
      }
    });
  });
});

describe('0052–0053 owner SQL integrity behavior', () => {
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

  it('deleting optional parents SET NULLs only the optional id and keeps organization_id', async () => {
    const tenant = await provisionTenant(database, 'setnull@example.test', 'SET NULL Org');

    const ids = await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Tower A' });
      const employee = await createEmployee(context, {
        name: 'Ada Assignee',
        rateUnit: 'hourly',
        burdenPercent: '0',
        baseRate: '50',
      });
      const punch = await createPunchListItem(context, {
        projectId,
        title: 'Seal joint',
        assigneeEmployeeId: employee.id,
      });
      const inspector = await createEmployee(context, {
        name: 'Ian Inspector',
        rateUnit: 'hourly',
        burdenPercent: '0',
        baseRate: '60',
      });
      const template = await createFormTemplate(context, {
        name: 'Site checklist',
        schema: { fields: [{ key: 'ok', type: 'yes_no', label: 'OK' }] },
      });
      const inspection = await createInspection(context, {
        projectId,
        title: 'Roof inspection',
        inspectorEmployeeId: inspector.id,
        formTemplateId: template.id,
      });
      const safety = await createSafetyRecord(context, {
        projectId,
        recordType: 'incident',
        occurredAt: new Date('2026-08-01T08:00:00Z'),
        title: 'Near miss',
        description: 'Scaffold clip',
      });
      const log = await createDailyLog(context, {
        projectId,
        logDate: '2026-08-01',
        summary: 'Poured slab',
      });
      await linkDailyLogSafetyRecord(context, {
        dailyLogId: log.id,
        safetyRecordId: safety.id,
      });
      const vendor = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
      const engagement = await createVendorEngagement(context, {
        vendorId: vendor.id,
        projectId,
      });
      const agreement = await createSubcontract(context, {
        title: 'Electrical package',
        vendorId: vendor.id,
        projectId,
        originalAmount: '100000',
      });
      const boq = await createProjectBoq(context, { projectId, title: 'Tower BOQ' });
      const schedule = await createSubcontractorSchedule(context, {
        projectId,
        boqId: boq!.id,
        vendorEngagementId: engagement.id,
        subcontractAgreementId: agreement.id,
        title: 'Electrical schedule',
      });
      const draftBill = await createDraftApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: context.organization.baseCurrency,
        totalAmount: '1000',
        billDate: '2026-08-01',
        subcontractAgreementId: agreement.id,
        lines: billLines(context.organization.baseCurrency, '1000'),
      });
      const opportunity = await createOpportunity(context, { name: 'Tower bid' });
      const quote = await createQuote(context, {
        title: 'Tower quote',
        opportunityId: opportunity.id,
        lines: [{ description: 'Package', quantity: '1', unitPriceAmount: '1000' }],
      });
      return {
        organizationId: tenant.organizationId,
        projectId,
        employeeId: employee.id,
        punchId: punch.id,
        inspectorId: inspector.id,
        templateId: template.id,
        inspectionId: inspection.id,
        safetyId: safety.id,
        logId: log.id,
        agreementId: agreement.id,
        scheduleId: schedule!.id,
        draftBillId: draftBill.id,
        opportunityId: opportunity.id,
        quoteId: quote.id,
      };
    });

    await database.asService(async (db) => {
      await db.execute(sql`DELETE FROM employees WHERE id = ${ids.employeeId}::uuid`);
      await db.execute(sql`DELETE FROM employees WHERE id = ${ids.inspectorId}::uuid`);
      await db.execute(sql`DELETE FROM form_templates WHERE id = ${ids.templateId}::uuid`);
      await db.execute(sql`DELETE FROM safety_records WHERE id = ${ids.safetyId}::uuid`);
      await db.execute(sql`DELETE FROM crm_opportunities WHERE id = ${ids.opportunityId}::uuid`);
    });

    const afterParentDeletes = await database.asService(async (db) => {
      const punch = resultRows<{
        assignee_employee_id: string | null;
        organization_id: string;
      }>(
        await db.execute(sql`
          SELECT assignee_employee_id, organization_id FROM punch_list_items WHERE id = ${ids.punchId}::uuid
        `),
      )[0]!;
      const inspection = resultRows<{
        inspector_employee_id: string | null;
        form_template_id: string | null;
        organization_id: string;
      }>(
        await db.execute(sql`
          SELECT inspector_employee_id, form_template_id, organization_id
          FROM inspections WHERE id = ${ids.inspectionId}::uuid
        `),
      )[0]!;
      const log = resultRows<{
        linked_safety_record_id: string | null;
        organization_id: string;
      }>(
        await db.execute(sql`
          SELECT linked_safety_record_id, organization_id FROM daily_logs WHERE id = ${ids.logId}::uuid
        `),
      )[0]!;
      const quote = resultRows<{ opportunity_id: string | null; organization_id: string }>(
        await db.execute(sql`
          SELECT opportunity_id, organization_id FROM estimates WHERE id = ${ids.quoteId}::uuid
        `),
      )[0]!;
      return { punch, inspection, log, quote };
    });

    expect(afterParentDeletes.punch.assignee_employee_id).toBeNull();
    expect(afterParentDeletes.punch.organization_id).toBe(ids.organizationId);
    expect(afterParentDeletes.inspection.inspector_employee_id).toBeNull();
    expect(afterParentDeletes.inspection.form_template_id).toBeNull();
    expect(afterParentDeletes.inspection.organization_id).toBe(ids.organizationId);
    expect(afterParentDeletes.log.linked_safety_record_id).toBeNull();
    expect(afterParentDeletes.log.organization_id).toBe(ids.organizationId);
    expect(afterParentDeletes.quote.opportunity_id).toBeNull();
    expect(afterParentDeletes.quote.organization_id).toBe(ids.organizationId);

    await database.asService(async (db) => {
      await db.execute(
        sql`DELETE FROM subcontract_agreements WHERE id = ${ids.agreementId}::uuid`,
      );
    });

    const afterAgreementDelete = await database.asService(async (db) => {
      const schedule = resultRows<{
        subcontract_agreement_id: string | null;
        organization_id: string;
      }>(
        await db.execute(sql`
          SELECT subcontract_agreement_id, organization_id
          FROM boq_subcontractor_schedules WHERE id = ${ids.scheduleId}::uuid
        `),
      )[0]!;
      const bill = resultRows<{
        subcontract_agreement_id: string | null;
        organization_id: string;
        status: string;
      }>(
        await db.execute(sql`
          SELECT subcontract_agreement_id, organization_id, status
          FROM ap_bills WHERE id = ${ids.draftBillId}::uuid
        `),
      )[0]!;
      return { schedule, bill };
    });

    expect(afterAgreementDelete.schedule.subcontract_agreement_id).toBeNull();
    expect(afterAgreementDelete.schedule.organization_id).toBe(ids.organizationId);
    expect(afterAgreementDelete.bill.status).toBe('draft');
    expect(afterAgreementDelete.bill.subcontract_agreement_id).toBeNull();
    expect(afterAgreementDelete.bill.organization_id).toBe(ids.organizationId);
  });

  it('enforces AP bill ↔ subcontract org/vendor/exact project/currency and blocks posted reassignment', async () => {
    const tenant = await provisionTenant(database, 'ap-sub@example.test', 'AP Sub Org');

    const seeded = await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      const vendorA = await createVendor(context, { name: 'Vendor A', type: 'subcontractor' });
      const vendorB = await createVendor(context, { name: 'Vendor B', type: 'subcontractor' });
      const { projectId: projectA } = await createProject(context, { name: 'Project A' });
      const { projectId: projectB } = await createProject(context, { name: 'Project B' });
      const agreementA = await createSubcontract(context, {
        title: 'Package A',
        vendorId: vendorA.id,
        projectId: projectA,
        originalAmount: '80000',
      });
      const agreementB = await createSubcontract(context, {
        title: 'Package B',
        vendorId: vendorA.id,
        projectId: projectA,
        originalAmount: '20000',
      });
      const currency = context.organization.baseCurrency;
      const posted = await createApBill(context, {
        vendorId: vendorA.id,
        projectId: projectA,
        currency,
        totalAmount: '5000',
        billDate: '2026-08-01',
        subcontractAgreementId: agreementA.id,
        lines: billLines(currency, '5000'),
      });
      const draft = await createDraftApBill(context, {
        vendorId: vendorA.id,
        projectId: projectA,
        currency,
        totalAmount: '700',
        billDate: '2026-08-01',
        subcontractAgreementId: agreementA.id,
        lines: billLines(currency, '700'),
      });
      return {
        organizationId: tenant.organizationId,
        vendorAId: vendorA.id,
        vendorBId: vendorB.id,
        projectA,
        projectB,
        agreementAId: agreementA.id,
        agreementBId: agreementB.id,
        postedId: posted.id,
        draftId: draft.id,
        currency,
      };
    });

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createApBill(context, {
          vendorId: seeded.vendorAId,
          projectId: seeded.projectA,
          currency: seeded.currency,
          totalAmount: '100',
          billDate: '2026-08-01',
          subcontractAgreementId: seeded.agreementAId,
          lines: billLines(seeded.currency, '100'),
        });
        await createApBill(context, {
          vendorId: seeded.vendorBId,
          projectId: seeded.projectA,
          currency: seeded.currency,
          totalAmount: '100',
          billDate: '2026-08-01',
          subcontractAgreementId: seeded.agreementAId,
          lines: billLines(seeded.currency, '100'),
        });
      }),
    ).rejects.toSatisfy((error) =>
      /vendor mismatch|vendor must match|check_violation|23514|Failed query|DomainRuleError/i.test(
        errorBlob(error),
      ),
    );

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createApBill(context, {
          vendorId: seeded.vendorAId,
          projectId: seeded.projectB,
          currency: seeded.currency,
          totalAmount: '100',
          billDate: '2026-08-01',
          subcontractAgreementId: seeded.agreementAId,
          lines: billLines(seeded.currency, '100'),
        });
      }),
    ).rejects.toSatisfy((error) => /project mismatch|check_violation|23514|Failed query/i.test(errorBlob(error)));

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createApBill(context, {
          vendorId: seeded.vendorAId,
          currency: seeded.currency,
          totalAmount: '100',
          billDate: '2026-08-01',
          subcontractAgreementId: seeded.agreementAId,
          lines: billLines(seeded.currency, '100'),
        });
      }),
    ).rejects.toSatisfy((error) =>
      /requires an exact project|check_violation|23514|Failed query/i.test(errorBlob(error)),
    );

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createApBill(context, {
          vendorId: seeded.vendorAId,
          projectId: seeded.projectA,
          currency: 'USD',
          totalAmount: '100',
          billDate: '2026-08-01',
          subcontractAgreementId: seeded.agreementAId,
          lines: billLines('USD', '100'),
        });
      }),
    ).rejects.toSatisfy((error) => /currency mismatch|check_violation|23514|Failed query/i.test(errorBlob(error)));

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          UPDATE ap_bills
          SET subcontract_agreement_id = ${seeded.agreementBId}::uuid
          WHERE id = ${seeded.postedId}::uuid
        `);
      }),
    ).rejects.toSatisfy((error) =>
      /historical on recognized bills|integrity_constraint_violation|Failed query/i.test(errorBlob(error)),
    );

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          UPDATE ap_bills
          SET subcontract_agreement_id = NULL
          WHERE id = ${seeded.postedId}::uuid
        `);
      }),
    ).rejects.toSatisfy((error) =>
      /historical on recognized bills|integrity_constraint_violation|Failed query/i.test(errorBlob(error)),
    );

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE ap_bills
        SET subcontract_agreement_id = ${seeded.agreementBId}::uuid
        WHERE id = ${seeded.draftId}::uuid
      `);
    });
    const movedDraft = resultRows<{ subcontract_agreement_id: string }>(
      await database.asService((db) =>
        db.execute(sql`SELECT subcontract_agreement_id FROM ap_bills WHERE id = ${seeded.draftId}::uuid`),
      ),
    )[0]!;
    expect(movedDraft.subcontract_agreement_id).toBe(seeded.agreementBId);

    await expect(
      database.asService(async (db) => {
        await db.execute(
          sql`DELETE FROM subcontract_agreements WHERE id = ${seeded.agreementAId}::uuid`,
        );
      }),
    ).rejects.toSatisfy((error) =>
      /historical on recognized bills|integrity_constraint_violation|Failed query/i.test(errorBlob(error)),
    );

    const postedStillLinked = resultRows<{
      subcontract_agreement_id: string;
      organization_id: string;
    }>(
      await database.asService((db) =>
        db.execute(sql`
          SELECT subcontract_agreement_id, organization_id
          FROM ap_bills WHERE id = ${seeded.postedId}::uuid
        `),
      ),
    )[0]!;
    expect(postedStillLinked.subcontract_agreement_id).toBe(seeded.agreementAId);
    expect(postedStillLinked.organization_id).toBe(seeded.organizationId);
  });

  it('enforces BOQ schedule ↔ agreement project/vendor/currency on insert and update', async () => {
    const tenant = await provisionTenant(database, 'boq-sub@example.test', 'BOQ Sub Org');

    const seeded = await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      const vendorA = await createVendor(context, { name: 'Vendor A', type: 'subcontractor' });
      const vendorB = await createVendor(context, { name: 'Vendor B', type: 'subcontractor' });
      const { projectId: projectA } = await createProject(context, { name: 'Project A' });
      const { projectId: projectB } = await createProject(context, { name: 'Project B' });
      const engagementA = await createVendorEngagement(context, {
        vendorId: vendorA.id,
        projectId: projectA,
      });
      const engagementBOnA = await createVendorEngagement(context, {
        vendorId: vendorB.id,
        projectId: projectA,
      });
      const engagementAOnB = await createVendorEngagement(context, {
        vendorId: vendorA.id,
        projectId: projectB,
      });
      const agreementA = await createSubcontract(context, {
        title: 'Package A',
        vendorId: vendorA.id,
        projectId: projectA,
        originalAmount: '50000',
      });
      const agreementOnB = await createSubcontract(context, {
        title: 'Package B',
        vendorId: vendorA.id,
        projectId: projectB,
        originalAmount: '15000',
      });
      const boqA = await createProjectBoq(context, { projectId: projectA, title: 'BOQ A' });
      const boqAUsd = await createProjectBoq(context, {
        projectId: projectA,
        title: 'BOQ USD',
        currency: 'USD',
      });
      const boqB = await createProjectBoq(context, { projectId: projectB, title: 'BOQ B' });
      const ok = await createSubcontractorSchedule(context, {
        projectId: projectA,
        boqId: boqA!.id,
        vendorEngagementId: engagementA.id,
        subcontractAgreementId: agreementA.id,
        title: 'Matched schedule',
      });
      return {
        organizationId: tenant.organizationId,
        projectA,
        projectB,
        engagementAId: engagementA.id,
        engagementBOnAId: engagementBOnA.id,
        engagementAOnBId: engagementAOnB.id,
        agreementAId: agreementA.id,
        agreementOnBId: agreementOnB.id,
        boqAId: boqA!.id,
        boqAUsdId: boqAUsd!.id,
        boqBId: boqB!.id,
        okScheduleId: ok!.id,
        currency: context.organization.baseCurrency,
      };
    });

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createSubcontractorSchedule(context, {
          projectId: seeded.projectB,
          boqId: seeded.boqBId,
          vendorEngagementId: seeded.engagementAOnBId,
          subcontractAgreementId: seeded.agreementAId,
          title: 'Cross project',
        });
      }),
    ).rejects.toSatisfy((error) =>
      /agreement must belong|project mismatch|check_violation|23514|Failed query/i.test(errorBlob(error)),
    );

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id,
            subcontract_agreement_id, title, status, currency
          ) VALUES (
            ${seeded.organizationId}::uuid, ${seeded.projectB}::uuid, ${seeded.boqBId}::uuid,
            ${seeded.engagementAOnBId}::uuid, ${seeded.agreementAId}::uuid,
            'SQL cross project', 'draft', ${seeded.currency}
          )
        `);
      }),
    ).rejects.toSatisfy((error) => /agreement project mismatch|check_violation|Failed query/i.test(errorBlob(error)));

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id,
            subcontract_agreement_id, title, status, currency
          ) VALUES (
            ${seeded.organizationId}::uuid, ${seeded.projectA}::uuid, ${seeded.boqAId}::uuid,
            ${seeded.engagementBOnAId}::uuid, ${seeded.agreementAId}::uuid,
            'App-bypass wrong vendor', 'draft', ${seeded.currency}
          )
        `);
      }),
    ).rejects.toSatisfy((error) =>
      /engagement vendor must match|check_violation|Failed query/i.test(errorBlob(error)),
    );

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        await createSubcontractorSchedule(context, {
          projectId: seeded.projectA,
          boqId: seeded.boqAUsdId,
          vendorEngagementId: seeded.engagementAId,
          subcontractAgreementId: seeded.agreementAId,
          title: 'Currency mismatch',
        });
      }),
    ).rejects.toSatisfy((error) => /currency mismatch|check_violation|23514|Failed query/i.test(errorBlob(error)));

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          UPDATE boq_subcontractor_schedules
          SET subcontract_agreement_id = ${seeded.agreementOnBId}::uuid
          WHERE id = ${seeded.okScheduleId}::uuid
        `);
      }),
    ).rejects.toSatisfy((error) => /agreement project mismatch|check_violation|Failed query/i.test(errorBlob(error)));
  });

  it('rejects daily-log safety links across projects and org-level records', async () => {
    const tenant = await provisionTenant(database, 'log-safety@example.test', 'Log Safety Org');

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        const { projectId: projectA } = await createProject(context, { name: 'Site A' });
        const { projectId: projectB } = await createProject(context, { name: 'Site B' });
        const log = await createDailyLog(context, {
          projectId: projectA,
          logDate: '2026-08-02',
          summary: 'Formwork',
        });
        const otherProject = await createSafetyRecord(context, {
          projectId: projectB,
          recordType: 'incident',
          occurredAt: new Date('2026-08-02T08:00:00Z'),
          title: 'Other site',
          description: 'Wrong project',
        });
        await linkDailyLogSafetyRecord(context, {
          dailyLogId: log.id,
          safetyRecordId: otherProject.id,
        });
      }),
    ).rejects.toSatisfy((error) =>
      /same project|check_violation|23514|Failed query/i.test(errorBlob(error)),
    );

    await expect(
      database.asUser(tenant.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: tenant.owner.id,
          organizationId: tenant.organizationId,
          locale: 'en',
        });
        const { projectId } = await createProject(context, { name: 'Site C' });
        const log = await createDailyLog(context, {
          projectId,
          logDate: '2026-08-03',
          summary: 'Steel',
        });
        const orgLevel = await createSafetyRecord(context, {
          recordType: 'observation',
          occurredAt: new Date('2026-08-03T08:00:00Z'),
          title: 'Org toolbox',
          description: 'No project',
        });
        await linkDailyLogSafetyRecord(context, {
          dailyLogId: log.id,
          safetyRecordId: orgLevel.id,
        });
      }),
    ).rejects.toSatisfy((error) =>
      /same project|check_violation|23514|Failed query/i.test(errorBlob(error)),
    );
  });

  it('hides compensation documents, versions, links, and OCR from documents.read without workforce.cost.read', async () => {
    const tenant = await provisionTenant(database, 'docs-owner@example.test', 'Docs Org');
    const reader = await onboardCustomRole(
      database,
      tenant.organizationId,
      'docs-reader@example.test',
      'docs_reader',
      ['documents.read'],
    );

    const seeded = await database.asService(async (db) => {
      const compensation = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO documents (
            organization_id, storage_bucket, storage_path, original_filename,
            mime_type, status, privacy_class
          ) VALUES (
            ${tenant.organizationId}::uuid, 'org-docs',
            ${`organizations/${tenant.organizationId}/documents/comp-pay.pdf`},
            'pay-rates.pdf', 'application/pdf', 'available', 'compensation'
          )
          RETURNING id
        `),
      )[0]!;
      const standard = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO documents (
            organization_id, storage_bucket, storage_path, original_filename,
            mime_type, status, privacy_class
          ) VALUES (
            ${tenant.organizationId}::uuid, 'org-docs',
            ${`organizations/${tenant.organizationId}/documents/site-plan.pdf`},
            'site-plan.pdf', 'application/pdf', 'available', 'standard'
          )
          RETURNING id
        `),
      )[0]!;
      const version = resultRows<{ id: string }>(
        await db.execute(sql`
          WITH inserted AS (
            INSERT INTO document_versions (
              organization_id, document_id, version_number, storage_bucket, storage_path,
              original_filename, mime_type, is_current
            ) VALUES (
              ${tenant.organizationId}::uuid, ${compensation.id}::uuid, 1, 'org-docs',
              ${`organizations/${tenant.organizationId}/documents/comp-pay-v1.pdf`},
              'pay-rates-v1.pdf', 'application/pdf', true
            )
            RETURNING id
          ),
          updated AS (
            UPDATE documents
            SET current_version_id = (SELECT id FROM inserted)
            WHERE id = ${compensation.id}::uuid
            RETURNING current_version_id
          )
          SELECT id FROM inserted
        `),
      )[0]!;
      const employee = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO employees (organization_id, name, status)
          VALUES (${tenant.organizationId}::uuid, 'Payee', 'active')
          RETURNING id
        `),
      )[0]!;
      const link = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO document_links (
            organization_id, document_id, owner_type, owner_id, label
          ) VALUES (
            ${tenant.organizationId}::uuid, ${compensation.id}::uuid,
            'employee', ${employee.id}::uuid, 'Compensation file'
          )
          RETURNING id
        `),
      )[0]!;
      const ocr = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO ocr_extraction_jobs (
            organization_id, document_id, document_version_id, source_filename,
            status, review_status, provider_id, extracted_candidates, review_overrides
          ) VALUES (
            ${tenant.organizationId}::uuid, ${compensation.id}::uuid, ${version.id}::uuid,
            'pay-rates.pdf', 'succeeded', 'awaiting_review', 'azure',
            '{"hourlyRate":"180"}'::jsonb, '{"accepted":"hourlyRate"}'::jsonb
          )
          RETURNING id
        `),
      )[0]!;
      return {
        compensationId: compensation.id,
        standardId: standard.id,
        versionId: version.id,
        linkId: link.id,
        ocrId: ocr.id,
      };
    });

    const asReader = await database.asUser(reader.id, async (tx) => {
      const documents = resultRows<{ id: string; original_filename: string }>(
        await tx.execute(sql`SELECT id, original_filename FROM documents`),
      );
      const versions = resultRows<{ id: string; original_filename: string }>(
        await tx.execute(sql`SELECT id, original_filename FROM document_versions`),
      );
      const links = resultRows<{ id: string; label: string | null }>(
        await tx.execute(sql`SELECT id, label FROM document_links`),
      );
      const ocr = resultRows<{
        id: string;
        source_filename: string | null;
        extracted_candidates: unknown;
      }>(
        await tx.execute(
          sql`SELECT id, source_filename, extracted_candidates FROM ocr_extraction_jobs`,
        ),
      );
      return { documents, versions, links, ocr };
    });

    expect(asReader.documents.map((row) => row.id)).toEqual([seeded.standardId]);
    expect(asReader.documents.some((row) => row.original_filename === 'pay-rates.pdf')).toBe(false);
    expect(asReader.versions).toEqual([]);
    expect(asReader.links).toEqual([]);
    expect(asReader.ocr).toEqual([]);

    const asOwner = await database.asUser(tenant.owner.id, async (tx) => {
      const documents = resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM documents`));
      const versions = resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM document_versions`),
      );
      const links = resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM document_links`));
      const ocr = resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM ocr_extraction_jobs`),
      );
      return { documents, versions, links, ocr };
    });

    expect(asOwner.documents.map((row) => row.id).sort()).toEqual(
      [seeded.compensationId, seeded.standardId].sort(),
    );
    expect(asOwner.versions.map((row) => row.id)).toEqual([seeded.versionId]);
    expect(asOwner.links.map((row) => row.id)).toEqual([seeded.linkId]);
    expect(asOwner.ocr.map((row) => row.id)).toEqual([seeded.ocrId]);
  });

  it('allows only one default saved view per organization/user/list and supports replacement', async () => {
    const tenant = await provisionTenant(database, 'views@example.test', 'Views Org');

    await database.asUser(tenant.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: tenant.owner.id,
        organizationId: tenant.organizationId,
        locale: 'en',
      });
      await saveSavedListView(context, {
        listKey: 'projects',
        name: 'Mine',
        query: { status: 'active' },
        isDefault: true,
      });
      await saveSavedListView(context, {
        listKey: 'projects',
        name: 'All open',
        query: { status: 'open' },
        isDefault: true,
      });
    });

    const afterReplace = resultRows<{ name: string; is_default: boolean }>(
      await database.asService((db) =>
        db.execute(sql`
          SELECT name, is_default
          FROM saved_list_views
          WHERE organization_id = ${tenant.organizationId}::uuid
            AND user_id = ${tenant.owner.id}::uuid
            AND list_key = 'projects'
          ORDER BY name
        `),
      ),
    );
    expect(afterReplace.filter((row) => row.is_default)).toEqual([
      { name: 'All open', is_default: true },
    ]);

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO saved_list_views (
            organization_id, user_id, list_key, name, query_json, is_default
          ) VALUES (
            ${tenant.organizationId}::uuid, ${tenant.owner.id}::uuid,
            'projects', 'Second default', '{}'::jsonb, true
          )
        `);
      }),
    ).rejects.toSatisfy((error) => /saved_list_views_user_list_default_uq|23505|Failed query/i.test(errorBlob(error)));
  });
});
