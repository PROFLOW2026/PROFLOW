/**
 * One read of cash already paid and attributable to a project.
 * Expenses matched to an AP bill are omitted here; the bill payment is authoritative.
 */

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { ProjectPaidFact, ProjectPaidKind } from '../domain/project-paid-cash';
import { sqlRows } from './sql-rows';

interface ProjectPaidFactRow {
  kind: ProjectPaidKind;
  parent_id: string;
  project_id: string | null;
  project_name: string | null;
  category_key: string | null;
  subcontract_agreement_id: string | null;
  parent_net: string;
  parent_gross: string;
  paid_gross: string;
  line_amount: string | null;
  amount_basis: 'net' | 'gross' | null;
  known_amount: string | null;
  has_allocation: boolean | string | null;
}

export async function loadProjectPaidCashFacts(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly ProjectPaidFact[]> {
  const result = await db.execute(sql`
    WITH paid_expenses AS (
      SELECT
        e.id,
        e.project_id,
        e.net_amount,
        e.gross_amount,
        e.paid_gross_amount,
        cc.key AS category_key,
        EXISTS (
          SELECT 1
          FROM expense_allocations a
          WHERE a.organization_id = e.organization_id
            AND a.expense_id = e.id
        ) AS has_allocation
      FROM expenses e
      LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
      WHERE e.organization_id = ${organizationId}
        AND upper(e.currency) = upper(${currency})
        AND e.status = 'finalized'
        AND e.archived_at IS NULL
        AND e.voids_expense_id IS NULL
        AND e.paid_gross_amount::numeric > 0
        AND coalesce(cc.key, '') <> 'internal_employee_payroll'
        AND NOT EXISTS (
          SELECT 1
          FROM ap_po_matches m
          INNER JOIN ap_bills b
            ON b.id = m.ap_bill_id
            AND b.organization_id = m.organization_id
          WHERE m.organization_id = e.organization_id
            AND m.expense_id = e.id
            AND m.status = 'accepted'
            AND b.status IN ('open', 'partially_matched', 'matched')
            AND b.archived_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM expenses rev
          WHERE rev.organization_id = e.organization_id
            AND rev.voids_expense_id = e.id
            AND rev.archived_at IS NULL
        )
    ),
    paid_bills AS (
      SELECT
        b.id,
        b.project_id,
        b.net_amount,
        b.gross_amount,
        b.subcontract_agreement_id,
        paid.paid_gross,
        EXISTS (
          SELECT 1
          FROM ap_bill_project_allocations a
          WHERE a.organization_id = b.organization_id
            AND a.ap_bill_id = b.id
            AND a.status = 'applied'
        ) AS has_allocation
      FROM ap_bills b
      INNER JOIN (
        SELECT app.ap_bill_id, sum(app.applied_amount) AS paid_gross
        FROM ap_payment_applications app
        INNER JOIN ap_payments pay
          ON pay.id = app.ap_payment_id
          AND pay.organization_id = app.organization_id
        WHERE app.organization_id = ${organizationId}
          AND pay.status = 'recorded'
          AND pay.voided_at IS NULL
          AND upper(app.currency) = upper(${currency})
        GROUP BY app.ap_bill_id
      ) paid ON paid.ap_bill_id = b.id
      WHERE b.organization_id = ${organizationId}
        AND b.archived_at IS NULL
        AND b.status IN ('open', 'partially_matched', 'matched')
        AND paid.paid_gross > 0
    )
    SELECT
      'expense_header'::text AS kind,
      e.id::text AS parent_id,
      e.project_id::text AS project_id,
      pr.name AS project_name,
      e.category_key,
      NULL::text AS subcontract_agreement_id,
      e.net_amount::text AS parent_net,
      e.gross_amount::text AS parent_gross,
      e.paid_gross_amount::text AS paid_gross,
      NULL::text AS line_amount,
      NULL::text AS amount_basis,
      NULL::text AS known_amount,
      e.has_allocation
    FROM paid_expenses e
    LEFT JOIN projects pr ON pr.id = e.project_id
    UNION ALL
    SELECT
      'expense_line'::text,
      e.id::text,
      a.project_id::text,
      pr.name,
      coalesce(lcc.key, e.category_key),
      NULL::text,
      e.net_amount::text,
      e.gross_amount::text,
      e.paid_gross_amount::text,
      a.amount::text,
      a.amount_basis,
      NULL::text,
      e.has_allocation
    FROM paid_expenses e
    INNER JOIN expense_allocations a
      ON a.expense_id = e.id
      AND a.organization_id = ${organizationId}
      AND a.target_type = 'project'
      AND a.project_id IS NOT NULL
    LEFT JOIN cost_categories lcc ON lcc.id = a.cost_category_id
    LEFT JOIN projects pr ON pr.id = a.project_id
    UNION ALL
    SELECT
      'ap_header'::text,
      b.id::text,
      b.project_id::text,
      pr.name,
      NULL::text,
      b.subcontract_agreement_id::text,
      b.net_amount::text,
      b.gross_amount::text,
      b.paid_gross::text,
      NULL::text,
      NULL::text,
      NULL::text,
      b.has_allocation
    FROM paid_bills b
    LEFT JOIN projects pr ON pr.id = b.project_id
    UNION ALL
    SELECT
      'ap_line'::text,
      b.id::text,
      a.project_id::text,
      pr.name,
      NULL::text,
      b.subcontract_agreement_id::text,
      b.net_amount::text,
      b.gross_amount::text,
      b.paid_gross::text,
      a.amount::text,
      'net'::text,
      NULL::text,
      b.has_allocation
    FROM paid_bills b
    INNER JOIN ap_bill_project_allocations a
      ON a.ap_bill_id = b.id
      AND a.organization_id = ${organizationId}
      AND a.status = 'applied'
      AND a.target_type = 'project'
      AND a.project_id IS NOT NULL
    LEFT JOIN projects pr ON pr.id = a.project_id
    UNION ALL
    SELECT
      'payroll_line'::text,
      pay.id::text,
      line.project_id::text,
      pr.name,
      NULL::text,
      NULL::text,
      pay.paid_amount::text,
      pay.paid_amount::text,
      pay.paid_amount::text,
      line.amount::text,
      'net'::text,
      cost.known_amount::text,
      false
    FROM employee_payroll_payments pay
    INNER JOIN employee_month_costs cost
      ON cost.organization_id = pay.organization_id
      AND cost.employee_id = pay.employee_id
      AND cost.year_month = pay.year_month
      AND cost.status IN ('applied', 'closed')
      AND cost.recognition_source = 'monthly_allocated'
    INNER JOIN labor_allocation_runs run
      ON run.organization_id = cost.organization_id
      AND run.employee_month_cost_id = cost.id
      AND run.status = 'applied'
    INNER JOIN labor_allocation_run_lines line
      ON line.organization_id = run.organization_id
      AND line.labor_allocation_run_id = run.id
    LEFT JOIN projects pr ON pr.id = line.project_id
    WHERE pay.organization_id = ${organizationId}
      AND pay.paid_at IS NOT NULL
      AND pay.voided_at IS NULL
      AND pay.paid_amount::numeric > 0
      AND upper(pay.currency) = upper(${currency})
      AND cost.known_amount::numeric > 0
    UNION ALL
    SELECT
      'payroll_line'::text,
      pay.id::text,
      te.project_id::text,
      pr.name,
      NULL::text,
      NULL::text,
      pay.paid_amount::text,
      pay.paid_amount::text,
      pay.paid_amount::text,
      sum(
        CASE
          WHEN te.cost_amount IS NULL THEN 0
          WHEN te.excess_hours IS NULL OR te.excess_hours = 0 THEN te.cost_amount
          WHEN te.excess_approval_status = 'approved' THEN te.cost_amount
          ELSE te.cost_amount * (te.hours - te.excess_hours) / NULLIF(te.hours, 0)
        END
      )::text,
      'net'::text,
      coalesce(cost.known_amount, totals.total_cost)::text,
      false
    FROM employee_payroll_payments pay
    INNER JOIN time_entries te
      ON te.organization_id = pay.organization_id
      AND te.employee_id = pay.employee_id
      AND to_char(te.work_date, 'YYYY-MM') = pay.year_month
      AND te.kind = 'project'
      AND te.status = 'recorded'
      AND te.approval_status = 'approved'
      AND te.archived_at IS NULL
      AND te.project_id IS NOT NULL
      AND upper(te.cost_currency) = upper(${currency})
    LEFT JOIN employee_month_costs cost
      ON cost.organization_id = pay.organization_id
      AND cost.employee_id = pay.employee_id
      AND cost.year_month = pay.year_month
      AND cost.status IN ('draft', 'applied', 'closed')
    LEFT JOIN projects pr ON pr.id = te.project_id
    INNER JOIN (
      SELECT
        te2.organization_id,
        te2.employee_id,
        to_char(te2.work_date, 'YYYY-MM') AS year_month,
        sum(
          CASE
            WHEN te2.cost_amount IS NULL THEN 0
            WHEN te2.excess_hours IS NULL OR te2.excess_hours = 0 THEN te2.cost_amount
            WHEN te2.excess_approval_status = 'approved' THEN te2.cost_amount
            ELSE te2.cost_amount * (te2.hours - te2.excess_hours) / NULLIF(te2.hours, 0)
          END
        ) AS total_cost
      FROM time_entries te2
      WHERE te2.organization_id = ${organizationId}
        AND te2.status = 'recorded'
        AND te2.approval_status = 'approved'
        AND te2.archived_at IS NULL
        AND upper(te2.cost_currency) = upper(${currency})
      GROUP BY te2.organization_id, te2.employee_id, to_char(te2.work_date, 'YYYY-MM')
    ) totals
      ON totals.organization_id = pay.organization_id
      AND totals.employee_id = pay.employee_id
      AND totals.year_month = pay.year_month
    WHERE pay.organization_id = ${organizationId}
      AND pay.paid_at IS NOT NULL
      AND pay.voided_at IS NULL
      AND pay.paid_amount::numeric > 0
      AND upper(pay.currency) = upper(${currency})
      AND NOT EXISTS (
        SELECT 1
        FROM employee_month_costs displaced
        WHERE displaced.organization_id = pay.organization_id
          AND displaced.employee_id = pay.employee_id
          AND displaced.year_month = pay.year_month
          AND displaced.status IN ('applied', 'closed')
          AND displaced.recognition_source = 'monthly_allocated'
      )
    GROUP BY pay.id, te.project_id, pr.name, pay.paid_amount, cost.known_amount, totals.total_cost
    UNION ALL
    SELECT
      'advance'::text,
      adv.id::text,
      adv.project_id::text,
      pr.name,
      NULL::text,
      adv.subcontract_agreement_id::text,
      adv.amount::text,
      adv.amount::text,
      adv.amount::text,
      NULL::text,
      NULL::text,
      NULL::text,
      false
    FROM subcontract_advances adv
    LEFT JOIN projects pr ON pr.id = adv.project_id
    WHERE adv.organization_id = ${organizationId}
      AND adv.archived_at IS NULL
      AND adv.paid_date IS NOT NULL
      AND adv.project_id IS NOT NULL
      AND upper(adv.currency) = upper(${currency})
      AND adv.status IN (
        'paid',
        'partially_applied',
        'fully_applied',
        'partially_refunded',
        'fully_refunded'
      )
  `);

  return sqlRows<ProjectPaidFactRow>(result).map((row) => ({
    kind: row.kind,
    parentId: row.parent_id,
    projectId: row.project_id,
    projectName: row.project_name,
    categoryKey: row.category_key,
    subcontractAgreementId: row.subcontract_agreement_id,
    parentNet: row.parent_net,
    parentGross: row.parent_gross,
    paidGross: row.paid_gross,
    lineAmount: row.line_amount,
    amountBasis: row.amount_basis,
    knownAmount: row.known_amount,
    hasAllocation: row.has_allocation === true || row.has_allocation === 't' || row.has_allocation === 'true',
  }));
}
