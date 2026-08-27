import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

const AUDIT_DIR = path.resolve(process.cwd(), 'docs/audits');

export const OWNER_ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

export const OWNER_NEEDS_CLASSIFICATION_IDS = [
  '2807943d-8fcb-41e5-989d-3ee46982f8b0',
  '23559bd8-dc92-4f81-81e1-7b9ac85ae508',
  '3d6c0582-8bbe-43c6-a021-5734bd1ff93e',
] as const;

interface OwnerExpenseRow {
  readonly id: string;
  readonly status: string;
  readonly currency: string;
  readonly net_amount: string;
  readonly gross_amount: string;
  readonly tax_amount: string;
  readonly expense_date: string;
  readonly project_id: string | null;
  readonly vendor_id: string | null;
  readonly cost_family: string;
  readonly cost_category_id: string | null;
  readonly installment_count?: number;
  readonly inventory_stock_purchase?: boolean;
  readonly inventory_item_id?: string | null;
  readonly description?: string | null;
}

interface OwnerCategoryRow {
  readonly id: string;
  readonly organization_id: string;
  readonly key: string;
  readonly name: string;
  readonly family: string;
  readonly is_system: boolean;
  readonly sort_order: number;
}

interface OwnerVendorRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

export interface OwnerRehearsalSnapshot {
  readonly finalizedCount: number;
  readonly netSumBefore: string;
  readonly classified: number;
  readonly needsClassification: number;
  readonly netSumAfter: string;
  readonly projectDirectNet: string;
  readonly overheadNet: string;
}

async function loadJson<T>(fileName: string): Promise<T> {
  const raw = await readFile(path.join(AUDIT_DIR, fileName), 'utf8');
  return JSON.parse(raw) as T;
}

function sqlEscape(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Seeds Owner-shaped pre-0070 financial rows into PGlite (0069 state).
 * Source: read-only audit dumps — does NOT touch production.
 */
export async function seedOwnerPre0070(client: PGlite): Promise<{ netSumBefore: string; finalizedCount: number }> {
  const ownerRaw = await loadJson<{
    selectedOrganization: {
      id: string;
      name: string;
      baseCurrency: string;
      timezone: string;
      countryCode: string;
      defaultLocale: string;
    };
    domains: {
      expenses: { list: OwnerExpenseRow[] };
      contracts: { list: { project_id: string }[] };
    };
  }>('_owner-audit-raw.json');

  const categories = await loadJson<{ cats: OwnerCategoryRow[] }>('_owner-audit-categories.json');
  const vendors = await loadJson<{ vendors: OwnerVendorRow[] }>('_classification-owner-probe.json');

  const org = ownerRaw.selectedOrganization;
  await client.exec(`
    INSERT INTO organizations (id, name, country_code, base_currency, timezone, default_locale)
    VALUES (
      '${org.id}',
      '${sqlEscape(org.name)}',
      '${org.countryCode}',
      '${org.baseCurrency}',
      '${org.timezone}',
      '${org.defaultLocale}'
    );
  `);

  for (const cat of categories.cats) {
    await client.exec(`
      INSERT INTO cost_categories (
        id, organization_id, key, name, family, is_system, sort_order
      ) VALUES (
        '${cat.id}',
        '${cat.organization_id}',
        '${sqlEscape(cat.key)}',
        '${sqlEscape(cat.name)}',
        '${cat.family}',
        ${cat.is_system},
        ${cat.sort_order}
      )
      ON CONFLICT DO NOTHING;
    `);
  }

  for (const vendor of vendors.vendors) {
    await client.exec(`
      INSERT INTO vendors (id, organization_id, name, type)
      VALUES (
        '${vendor.id}',
        '${OWNER_ORG_ID}',
        '${sqlEscape(vendor.name)}',
        '${vendor.type}'
      )
      ON CONFLICT DO NOTHING;
    `);
  }

  const projectIds = new Set<string>();
  for (const contract of ownerRaw.domains.contracts?.list ?? []) {
    if (contract.project_id) projectIds.add(contract.project_id);
  }
  for (const exp of ownerRaw.domains.expenses.list) {
    if (exp.project_id) projectIds.add(exp.project_id);
  }
  for (const projectId of projectIds) {
    await client.exec(`
      INSERT INTO projects (id, organization_id, name, status, currency)
      VALUES (
        '${projectId}',
        '${OWNER_ORG_ID}',
        'Owner project ${projectId.slice(0, 8)}',
        'active',
        'ILS'
      )
      ON CONFLICT DO NOTHING;
    `);
  }

  const finalized = ownerRaw.domains.expenses.list.filter((row) => row.status === 'finalized');
  for (const exp of finalized) {
    const vendorSql = exp.vendor_id ? `'${exp.vendor_id}'` : 'NULL';
    const projectSql = exp.project_id ? `'${exp.project_id}'` : 'NULL';
    const categorySql = exp.cost_category_id ? `'${exp.cost_category_id}'` : 'NULL';
    const description = exp.description ? `'${sqlEscape(exp.description)}'` : 'NULL';
    await client.exec(`
      INSERT INTO expenses (
        id, organization_id, expense_date, description, vendor_id, project_id,
        cost_family, cost_category_id, net_amount, tax_amount, gross_amount, currency,
        status, installment_count, inventory_stock_purchase, inventory_item_id
      ) VALUES (
        '${exp.id}',
        '${OWNER_ORG_ID}',
        '${exp.expense_date.slice(0, 10)}',
        ${description},
        ${vendorSql},
        ${projectSql},
        '${exp.cost_family}',
        ${categorySql},
        ${exp.net_amount},
        ${exp.tax_amount},
        ${exp.gross_amount},
        '${exp.currency}',
        'finalized',
        ${exp.installment_count ?? 1},
        ${exp.inventory_stock_purchase === true},
        NULL
      );
    `);
  }

  const sumRow = await client.query<{ s: string }>(`
    SELECT COALESCE(SUM(net_amount), 0)::text AS s
    FROM expenses
    WHERE organization_id = '${OWNER_ORG_ID}' AND status = 'finalized'
  `);

  return {
    finalizedCount: finalized.length,
    netSumBefore: sumRow.rows[0]!.s,
  };
}

export async function readOwnerPost0070Diagnostics(client: PGlite): Promise<OwnerRehearsalSnapshot> {
  const counts = await client.query<{ classification_status: string; c: string }>(`
    SELECT classification_status, COUNT(*)::text AS c
    FROM expenses
    WHERE organization_id = '${OWNER_ORG_ID}' AND status = 'finalized'
    GROUP BY classification_status
  `);
  const byStatus = Object.fromEntries(counts.rows.map((r) => [r.classification_status, Number(r.c)]));
  const netAfter = await client.query<{ s: string }>(`
    SELECT COALESCE(SUM(net_amount), 0)::text AS s
    FROM expenses
    WHERE organization_id = '${OWNER_ORG_ID}' AND status = 'finalized'
  `);
  const projectDirect = await client.query<{ s: string }>(`
    SELECT COALESCE(SUM(net_amount), 0)::text AS s
    FROM expenses
    WHERE organization_id = '${OWNER_ORG_ID}'
      AND status = 'finalized'
      AND project_id IS NOT NULL
      AND COALESCE(inventory_stock_purchase, false) = false
  `);
  const overhead = await client.query<{ s: string }>(`
    SELECT COALESCE(SUM(net_amount), 0)::text AS s
    FROM expenses
    WHERE organization_id = '${OWNER_ORG_ID}'
      AND status = 'finalized'
      AND project_id IS NULL
      AND COALESCE(inventory_stock_purchase, false) = false
  `);

  return {
    finalizedCount: (byStatus.classified ?? 0) + (byStatus.needs_classification ?? 0),
    classified: byStatus.classified ?? 0,
    needsClassification: byStatus.needs_classification ?? 0,
    netSumBefore: netAfter.rows[0]!.s,
    netSumAfter: netAfter.rows[0]!.s,
    projectDirectNet: projectDirect.rows[0]!.s,
    overheadNet: overhead.rows[0]!.s,
  };
}
