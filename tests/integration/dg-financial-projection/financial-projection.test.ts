import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addProjectMember } from '@/modules/project-team';
import { generateReport } from '@/modules/reports';
import { assertReportKindPermission } from '@/modules/reports/domain/kinds';
import {
  SUBCONTRACT_MONEY_KEYS,
  addApprovedSubcontractChange,
  changeSubcontractStatus,
  createSubcontract,
  createVendor,
  getSubcontractById,
  getSubcontractForViewer,
  isFinancialSubcontractDetail,
  isFinancialSubcontractRow,
  listOrgSubcontracts,
  listOrgSubcontractsForViewer,
  listProjectSubcontracts,
  listProjectSubcontractsForViewer,
  listProjectSubcontractsOperational,
  listVendorSubcontracts,
  listVendorSubcontractsForViewer,
  recordSubcontractAdvance,
  updateSubcontract,
} from '@/modules/vendors';
import { AuthorizationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { Transaction } from '@/shared/db/types';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, orgContextFor } from '@tests/setup/dg-fixtures';
import { grantRolePermission } from '@tests/setup/dg-fixtures-permissions';
import { provisionTwoTenants } from '../projects/setup';

/**
 * Track B - financial projection security.
 *
 * Operational viewer = stock `worker` role + vendors.read (Owner toggle), no financial permission.
 * Run with: $env:PF_WIP_FILES='0168_dg_financial_projection_rls.sql'
 */

function expectNoMoneyKeys(value: object): void {
  const keys = Object.keys(value);
  for (const moneyKey of SUBCONTRACT_MONEY_KEYS) {
    expect(keys, `operational projection leaked "${moneyKey}"`).not.toContain(moneyKey);
  }
}

async function countRows(tx: Transaction, table: string): Promise<number> {
  const rows = resultRows<{ n: number | string }>(
    await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${table}`)),
  );
  return Number(rows[0]?.n ?? 0);
}

describe('subcontract financial projection (Track B)', () => {
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

  async function scenario() {
    const { orgA, userA: owner } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    await grantRolePermission(database, orgId, 'worker', PERMISSIONS.VENDORS_READ);

    const ops = await addOrgMember(database, orgId, 'ops');
    const finance = await addOrgMember(database, orgId, 'finance', 'finance');
    const pmFinancial = await addOrgMember(database, orgId, 'pm-fin');

    const fixture = await database.asUser(owner.id, async (tx) => {
      const context = await orgContextFor(tx, owner.id, orgId);
      const vendor = await createVendor(context, { name: 'Site Electric', type: 'subcontractor' });
      const { createProject } = await import('@/modules/projects');
      const p1 = (await createProject(context, { name: 'Tower One' })).projectId;
      const p2 = (await createProject(context, { name: 'Tower Two' })).projectId;
      const s1 = await createSubcontract(context, {
        title: 'Electrical package',
        vendorId: vendor.id,
        projectId: p1,
        originalAmount: '100000',
        retentionPercent: '5',
      });
      await changeSubcontractStatus(context, { subcontractId: s1.id, status: 'active' });
      await addApprovedSubcontractChange(context, {
        subcontractId: s1.id,
        kind: 'change_order',
        direction: 'addition',
        amount: '15000',
      });
      await recordSubcontractAdvance(context, {
        subcontractAgreementId: s1.id,
        amount: '7000',
      });
      const s2 = await createSubcontract(context, {
        title: 'Lighting package',
        vendorId: vendor.id,
        projectId: p2,
        originalAmount: '50000',
      });
      await addProjectMember(context, {
        projectId: p1,
        userId: pmFinancial.id,
        capabilities: ['contract.financial.view'],
      });
      return { vendorId: vendor.id, p1, p2, s1: s1.id, s2: s2.id };
    });

    return { orgId, owner, ops, finance, pmFinancial, ...fixture };
  }

  it('operational vendor reader receives only operational projections (no money keys)', async () => {
    const s = await scenario();

    await database.asUser(s.ops.id, async (tx) => {
      const context = await orgContextFor(tx, s.ops.id, s.orgId);
      expect(context.permissions.has(PERMISSIONS.VENDORS_READ)).toBe(true);
      expect(context.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ)).toBe(false);

      const vendorRows = await listVendorSubcontractsForViewer(context, s.vendorId);
      expect(vendorRows.map((row) => row.id).sort()).toEqual([s.s1, s.s2].sort());
      for (const row of vendorRows) {
        expect(isFinancialSubcontractRow(row)).toBe(false);
        expectNoMoneyKeys(row);
      }

      const projectRows = await listProjectSubcontractsForViewer(context, s.p1);
      expect(projectRows).toHaveLength(1);
      expectNoMoneyKeys(projectRows[0]!);

      const orgRows = await listOrgSubcontractsForViewer(context, {});
      expect(orgRows).toHaveLength(2);
      for (const row of orgRows) expectNoMoneyKeys(row);

      const operational = await listProjectSubcontractsOperational(context, s.p1);
      expect(operational[0]?.title).toBe('Electrical package');
      expectNoMoneyKeys(operational[0]!);

      const detail = await getSubcontractForViewer(context, s.s1);
      expect(isFinancialSubcontractDetail(detail)).toBe(false);
      expect(detail.title).toBe('Electrical package');
      expect(detail.vendorName).toBe('Site Electric');
      expectNoMoneyKeys(detail);
      expect(JSON.stringify(detail)).not.toMatch(/100000|115000|15000/);
    });
  });

  it('financial projections reject or omit rows for the operational reader', async () => {
    const s = await scenario();

    await database.asUser(s.ops.id, async (tx) => {
      const context = await orgContextFor(tx, s.ops.id, s.orgId);
      await expect(getSubcontractById(context, s.s1)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(listProjectSubcontracts(context, s.p1)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      expect(await listVendorSubcontracts(context, s.vendorId)).toEqual([]);
      expect(await listOrgSubcontracts(context, {})).toEqual([]);
      expect(() => assertReportKindPermission(context, 'subcontract_cash')).toThrow(
        AuthorizationError,
      );
    });
  });

  it('RLS: operational reader cannot SELECT value events or advances, still sees agreement rows', async () => {
    const s = await scenario();

    await database.asUser(s.ops.id, async (tx) => {
      expect(await countRows(tx, 'subcontract_agreements')).toBe(2);
      expect(await countRows(tx, 'subcontract_value_events')).toBe(0);
      expect(await countRows(tx, 'subcontract_advances')).toBe(0);
    });

    for (const user of [s.owner, s.finance]) {
      await database.asUser(user.id, async (tx) => {
        expect(await countRows(tx, 'subcontract_value_events')).toBe(3);
        expect(await countRows(tx, 'subcontract_advances')).toBe(1);
      });
    }
  });

  it('Owner and Finance keep the full financial projection', async () => {
    const s = await scenario();

    for (const user of [s.owner, s.finance]) {
      await database.asUser(user.id, async (tx) => {
        const context = await orgContextFor(tx, user.id, s.orgId);
        const detail = await getSubcontractById(context, s.s1);
        expect(detail.currentAmount).toBe(money('115000', detail.currency).amount);
        expect(detail.retentionPercent).not.toBeNull();
        expect(detail.events).toHaveLength(2);

        const viewerDetail = await getSubcontractForViewer(context, s.s1);
        expect(isFinancialSubcontractDetail(viewerDetail)).toBe(true);

        const rows = await listVendorSubcontractsForViewer(context, s.vendorId);
        expect(rows.every(isFinancialSubcontractRow)).toBe(true);
        const s1Row = rows.find((row) => row.id === s.s1);
        expect(s1Row && isFinancialSubcontractRow(s1Row) ? s1Row.currentAmount : null).toBe(
          money('115000', detail.currency).amount,
        );
        expect(await listOrgSubcontracts(context, {})).toHaveLength(2);
        expect(await listProjectSubcontracts(context, s.p2)).toHaveLength(1);
      });
    }
  });

  it('project capability contract.financial.view opens money on that project only', async () => {
    const s = await scenario();

    await database.asUser(s.pmFinancial.id, async (tx) => {
      const context = await orgContextFor(tx, s.pmFinancial.id, s.orgId);
      const detail = await getSubcontractById(context, s.s1);
      expect(detail.currentAmount).toBe(money('115000', detail.currency).amount);
      await expect(getSubcontractById(context, s.s2)).rejects.toBeInstanceOf(AuthorizationError);

      const rows = await listVendorSubcontractsForViewer(context, s.vendorId);
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(isFinancialSubcontractRow(byId.get(s.s1)!)).toBe(true);
      expect(isFinancialSubcontractRow(byId.get(s.s2)!)).toBe(false);
      expectNoMoneyKeys(byId.get(s.s2)!);

      expect((await listVendorSubcontracts(context, s.vendorId)).map((row) => row.id)).toEqual([
        s.s1,
      ]);

      // RLS mirror: only project 1 value events are selectable.
      expect(await countRows(tx, 'subcontract_value_events')).toBe(2);
    });
  });

  it('vendor/subcontract report carries no money for the operational reader', async () => {
    const s = await scenario();

    const opsReport = await database.asUser(s.ops.id, async (tx) => {
      const context = await orgContextFor(tx, s.ops.id, s.orgId);
      return generateReport(context, { kind: 'vendor_subcontract_summary', id: s.p1 });
    });
    const opsJson = JSON.stringify(opsReport.sections);
    expect(opsJson).toContain('Electrical package');
    expect(opsJson).not.toMatch(/115[,.]?000|100[,.]?000/);
    expect(opsReport.omitted.commercial).toBe(true);

    const ownerReport = await database.asUser(s.owner.id, async (tx) => {
      const context = await orgContextFor(tx, s.owner.id, s.orgId);
      return generateReport(context, { kind: 'vendor_subcontract_summary', id: s.p1 });
    });
    expect(JSON.stringify(ownerReport.sections)).toMatch(/115[,.]?000/);
  });

  it('agreement header money stays selectable and is masked unless the money gate passes', async () => {
    const s = await scenario();

    const header = async (userId: string) =>
      database.asUser(userId, async (tx) =>
        resultRows<{ original_amount: string | null; retention_percent: string | null }>(
          await tx.execute(sql`
            SELECT original_amount::text AS original_amount, retention_percent::text AS retention_percent
            FROM public.subcontract_agreements
            WHERE id = ${s.s1}::uuid
          `),
        ),
      );

    const opsHeader = await header(s.ops.id);
    expect(opsHeader[0]?.original_amount ?? null).toBeNull();
    expect(opsHeader[0]?.retention_percent ?? null).toBeNull();

    const financeHeader = await header(s.finance.id);
    expect(Number(financeHeader[0]?.original_amount)).toBe(100000);
    expect(Number(financeHeader[0]?.retention_percent)).toBe(5);

    const moneyIds = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();
    const selectView = sql`
      SELECT id, original_amount, retention_percent
      FROM public.subcontract_agreement_money_secure
    `;

    await database.asUser(s.ops.id, async (tx) => {
      expect(await countRows(tx, 'subcontract_agreements')).toBe(2);
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id, title, currency FROM public.subcontract_agreements`),
      );
      expect(rows).toHaveLength(2);
      expect(resultRows(await tx.execute(selectView))).toEqual([]);
    });

    await database.asUser(s.pmFinancial.id, async (tx) => {
      expect(moneyIds(resultRows(await tx.execute(selectView)))).toEqual([s.s1]);
    });

    await database.asUser(s.finance.id, async (tx) => {
      const context = await orgContextFor(tx, s.finance.id, s.orgId);
      const detail = await getSubcontractById(context, s.s1);
      expect(Number(detail.originalAmount)).toBe(100000);
      expect(moneyIds(resultRows(await tx.execute(selectView))).sort()).toEqual([s.s1, s.s2].sort());
    });

    await database.asUser(s.owner.id, async (tx) => {
      const rows = resultRows<{ id: string; original_amount: string; retention_percent: string }>(
        await tx.execute(selectView),
      );
      expect(moneyIds(rows)).toEqual([s.s1, s.s2].sort());
      const s1Money = rows.find((row) => row.id === s.s1)!;
      expect(Number(s1Money.original_amount)).toBe(100000);
      expect(Number(s1Money.retention_percent)).toBe(5);

      const context = await orgContextFor(tx, s.owner.id, s.orgId);
      const detail = await getSubcontractById(context, s.s1);
      expect(Number(detail.originalAmount)).toBe(100000);
      expect(Number(detail.retentionPercent)).toBe(5);

      const created = await createSubcontract(context, {
        title: 'Fire alarm package',
        vendorId: s.vendorId,
        projectId: s.p2,
        originalAmount: '25000',
        retentionPercent: '3',
      });
      expect(Number(created.originalAmount)).toBe(25000);
      const updated = await updateSubcontract(context, {
        subcontractId: created.id,
        retentionPercent: '4',
        notes: 'Retention renegotiated',
      });
      expect(Number(updated.retentionPercent)).toBe(4);
      expect(updated.notes).toBe('Retention renegotiated');
    });

    await database.asService(async (db) => {
      const rows = resultRows<Record<string, boolean>>(
        await db.execute(sql`
          SELECT
            has_column_privilege('authenticated', 'public.subcontract_agreements', 'original_amount', 'SELECT') AS amount,
            has_column_privilege('authenticated', 'public.subcontract_agreements', 'retention_percent', 'SELECT') AS retention,
            has_column_privilege('authenticated', 'public.subcontract_agreements', 'title', 'SELECT') AS title,
            has_column_privilege('authenticated', 'public.subcontract_agreements', 'original_amount', 'UPDATE') AS amount_update,
            has_table_privilege('authenticated', 'public.subcontract_agreements', 'INSERT') AS can_insert
        `),
      );
      expect(rows[0]).toEqual({
        amount: true,
        retention: true,
        title: true,
        amount_update: true,
        can_insert: true,
      });
    });
  });

  it('BOQ subcontractor money columns stay column-revoked from authenticated', async () => {
    await database.asService(async (db) => {
      const rows = resultRows<Record<string, boolean>>(
        await db.execute(sql`
          SELECT
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'unit_rate', 'SELECT') AS sched_rate,
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'amount', 'SELECT') AS sched_amount,
            has_column_privilege('authenticated', 'public.boq_subcontractor_schedule_lines', 'agreed_quantity', 'SELECT') AS sched_qty,
            has_column_privilege('authenticated', 'public.boq_subcontractor_valuation_lines', 'unit_rate_snapshot', 'SELECT') AS val_rate,
            has_column_privilege('authenticated', 'public.boq_subcontractor_valuation_lines', 'period_amount', 'SELECT') AS val_amount,
            has_column_privilege('authenticated', 'public.boq_subcontractor_valuation_lines', 'approved_quantity', 'SELECT') AS val_qty
        `),
      );
      expect(rows[0]).toEqual({
        sched_rate: false,
        sched_amount: false,
        sched_qty: true,
        val_rate: false,
        val_amount: false,
        val_qty: true,
      });
    });
  });

  it('site manager and operational PM templates receive no contract amounts or retention', async () => {
    const s = await scenario();
    const siteManager = await addOrgMember(database, s.orgId, 'site');
    const pmOps = await addOrgMember(database, s.orgId, 'pm-ops');
    await database.asUser(s.owner.id, async (tx) => {
      const context = await orgContextFor(tx, s.owner.id, s.orgId);
      await addProjectMember(context, {
        projectId: s.p1,
        userId: siteManager.id,
        templateKey: 'site_manager',
      });
      await addProjectMember(context, {
        projectId: s.p1,
        userId: pmOps.id,
        templateKey: 'project_manager_operational',
      });
    });

    const selectMoney = sql`
      SELECT id, original_amount, retention_percent
      FROM public.subcontract_agreement_money_secure
    `;

    for (const user of [siteManager, pmOps]) {
      await database.asUser(user.id, async (tx) => {
        const context = await orgContextFor(tx, user.id, s.orgId);
        expect(context.permissions.has(PERMISSIONS.VENDORS_READ)).toBe(true);
        expect(context.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ)).toBe(false);

        const operational = await listProjectSubcontractsOperational(context, s.p1);
        expect(operational).toHaveLength(1);
        expect(operational[0]?.title).toBe('Electrical package');
        expectNoMoneyKeys(operational[0]!);
        expect(JSON.stringify(operational)).not.toMatch(/100000|115000|15000/);

        const detail = await getSubcontractForViewer(context, s.s1);
        expect(isFinancialSubcontractDetail(detail)).toBe(false);
        expectNoMoneyKeys(detail);
        expect(JSON.stringify(detail)).not.toMatch(/100000|115000|15000/);

        await expect(getSubcontractById(context, s.s1)).rejects.toBeInstanceOf(AuthorizationError);
        expect(resultRows(await tx.execute(selectMoney))).toEqual([]);
      });
    }

    await database.asUser(s.owner.id, async (tx) => {
      const rows = resultRows<{ id: string; original_amount: string; retention_percent: string }>(
        await tx.execute(selectMoney),
      );
      const s1Money = rows.find((row) => row.id === s.s1);
      expect(Number(s1Money?.original_amount)).toBe(100000);
      expect(Number(s1Money?.retention_percent)).toBe(5);
    });
  });
});
