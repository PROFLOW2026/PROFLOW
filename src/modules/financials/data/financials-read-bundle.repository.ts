/**
 * Single-round-trip JSON bundles for Financials read path.
 * Raw facts only — existing domain folders consume these.
 */

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow } from './sql-rows';
import { LABOR_COST_DEFAULTS_SETTING_KEY } from '@/modules/tenancy/domain/labor-cost-defaults';
import { PROJECT_PROFITABILITY_MODE_SETTING_KEY } from '@/modules/tenancy/domain/project-profitability-mode';

export type FinancialsProjectSetupRow = {
  readonly exists: boolean;
  readonly currency: string | null;
  readonly expectedRemainingCostAmount: string | null;
  readonly workKind: string | null;
  readonly pricingMode: string | null;
  readonly openDraftDocumentCount: number;
  readonly openAllocationCount: number;
};

export async function loadFinancialsProjectSetupBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<FinancialsProjectSetupRow> {
  const row = sqlFirstRow<{
    exists: boolean;
    currency: string | null;
    expectedRemainingCostAmount: string | null;
    workKind: string | null;
    pricingMode: string | null;
    openDraftDocumentCount: string;
    openAllocationCount: string;
  }>(
    await db.execute(sql`
      select
        exists (
          select 1 from projects p
          where p.organization_id = ${organizationId}::uuid
            and p.id = ${projectId}::uuid
            and p.archived_at is null
        ) as exists,
        p.currency,
        p.expected_remaining_cost_amount as "expectedRemainingCostAmount",
        p.work_kind as "workKind",
        p.pricing_mode as "pricingMode",
        (
          (select count(*)::int from expenses e
           where e.organization_id = ${organizationId}::uuid and e.project_id = ${projectId}::uuid
             and e.status = 'draft' and e.archived_at is null)
          +
          (select count(*)::int from purchase_orders po
           where po.organization_id = ${organizationId}::uuid and po.project_id = ${projectId}::uuid
             and po.status = 'draft' and po.archived_at is null)
        )::text as "openDraftDocumentCount",
        (select count(*)::int from allocation_runs ar
         inner join allocation_run_lines arl
           on arl.run_id = ar.id and arl.organization_id = ar.organization_id
         where ar.organization_id = ${organizationId}::uuid
           and ar.status = 'draft'
           and arl.project_id = ${projectId}::uuid)::text as "openAllocationCount"
      from projects p
      where p.organization_id = ${organizationId}::uuid
        and p.id = ${projectId}::uuid
      limit 1
    `),
  );

  return {
    exists: row?.exists ?? false,
    currency: row?.currency ?? null,
    expectedRemainingCostAmount: row?.expectedRemainingCostAmount ?? null,
    workKind: row?.workKind ?? null,
    pricingMode: row?.pricingMode ?? null,
    openDraftDocumentCount: Number(row?.openDraftDocumentCount ?? 0),
    openAllocationCount: Number(row?.openAllocationCount ?? 0),
  };
}

export type FinancialsOrgPreflightRow = {
  readonly closedYearMonths: readonly string[];
  readonly laborCostDefaultsRaw: unknown;
  readonly projectProfitabilityModeRaw: unknown;
};

export async function loadFinancialsOrgPreflightBundle(
  db: DbExecutor,
  organizationId: string,
): Promise<FinancialsOrgPreflightRow> {
  const row = sqlFirstRow<{
    closedYearMonths: string[] | null;
    laborCostDefaultsRaw: unknown;
    projectProfitabilityModeRaw: unknown;
  }>(
    await db.execute(sql`
      select
        (select coalesce(jsonb_agg(mcp.year_month order by mcp.year_month), '[]'::jsonb)
         from month_close_periods mcp
         where mcp.organization_id = ${organizationId}::uuid
           and mcp.status = 'closed') as "closedYearMonths",
        (select os.value from organization_settings os
         where os.organization_id = ${organizationId}::uuid
           and os.key = ${LABOR_COST_DEFAULTS_SETTING_KEY}
         limit 1) as "laborCostDefaultsRaw",
        (select os.value from organization_settings os
         where os.organization_id = ${organizationId}::uuid
           and os.key = ${PROJECT_PROFITABILITY_MODE_SETTING_KEY}
         limit 1) as "projectProfitabilityModeRaw"
    `),
  );

  const closedRaw = row?.closedYearMonths;
  const closedYearMonths = Array.isArray(closedRaw)
    ? closedRaw.filter((ym): ym is string => typeof ym === 'string')
    : [];

  return {
    closedYearMonths,
    laborCostDefaultsRaw: row?.laborCostDefaultsRaw ?? null,
    projectProfitabilityModeRaw: row?.projectProfitabilityModeRaw ?? null,
  };
}

export type BillingRecordRow = {
  readonly id: string;
  readonly dueDate: string | null;
  readonly kind: string;
  readonly status: string;
  readonly totalAmount: string;
  readonly subtotalAmount: string;
  readonly currency: string;
  readonly retentionHeldRemaining: string | null;
};

export type BillingPaymentRow = {
  readonly billingRecordId: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
};

export type FinancialsBillingBundle = {
  readonly records: readonly BillingRecordRow[];
  readonly payments: readonly BillingPaymentRow[];
};

export async function loadFinancialsBillingBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<FinancialsBillingBundle> {
  const row = sqlFirstRow<{ payload: FinancialsBillingBundle | null }>(
    await db.execute(sql`
      select jsonb_build_object(
        'records', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', br.id,
            'dueDate', br.due_date,
            'kind', br.kind,
            'status', br.status,
            'totalAmount', br.total_amount,
            'subtotalAmount', br.subtotal_amount,
            'currency', br.currency,
            'retentionHeldRemaining', br.retention_held_remaining
          ) order by br.created_at)
          from billing_records br
          where br.organization_id = ${organizationId}::uuid
            and br.project_id = ${projectId}::uuid
            and br.archived_at is null
        ), '[]'::jsonb),
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'billingRecordId', pay_rows.billing_record_id,
            'amount', pay_rows.amount,
            'currency', pay_rows.currency,
            'status', pay_rows.status
          ))
          from (
            select
              pa.billing_record_id,
              pa.applied_amount as amount,
              pa.currency,
              pay.status
            from payment_applications pa
            inner join payments pay on pay.id = pa.payment_id
            where pa.organization_id = ${organizationId}::uuid
              and pay.organization_id = ${organizationId}::uuid
              and pa.billing_record_id in (
                select br.id from billing_records br
                where br.organization_id = ${organizationId}::uuid
                  and br.project_id = ${projectId}::uuid
                  and br.archived_at is null
              )
            union all
            select
              pay.billing_record_id,
              pay.amount,
              pay.currency,
              pay.status
            from payments pay
            where pay.organization_id = ${organizationId}::uuid
              and pay.billing_record_id in (
                select br.id from billing_records br
                where br.organization_id = ${organizationId}::uuid
                  and br.project_id = ${projectId}::uuid
                  and br.archived_at is null
              )
              and not exists (
                select 1 from payment_applications pa
                where pa.payment_id = pay.id
              )
          ) pay_rows
        ), '[]'::jsonb)
      ) as payload
    `),
  );

  const payload = row?.payload;
  return {
    records: payload?.records ?? [],
    payments: payload?.payments ?? [],
  };
}

export type ApBillFactRow = {
  readonly id: string;
  readonly projectId: string | null;
  readonly status: string;
  readonly totalAmount: string;
  readonly netAmount: string | null;
  readonly currency: string;
  readonly retentionHeldRemaining: string;
  readonly billDate: string | null;
};

export type ApAllocationFactRow = {
  readonly apBillId: string;
  readonly projectId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly targetType: string;
  readonly status: string;
};

export type ApCreditFactRow = {
  readonly apBillId: string;
  readonly appliedGross: string;
  readonly currency: string;
  readonly creditNet: string | null;
  readonly creditGross: string | null;
  readonly creditProjectId: string | null;
};

export type ApPaymentFactRow = {
  readonly apBillId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentStatus: string;
};

export type FinancialsApFactsBundle = {
  readonly bills: readonly ApBillFactRow[];
  readonly allocations: readonly ApAllocationFactRow[];
  readonly creditReductions: readonly ApCreditFactRow[];
  readonly vendorPayments: readonly ApPaymentFactRow[];
  readonly poMatches: readonly ApPoMatchFactRow[];
};

export type ApPoMatchFactRow = {
  readonly apBillId: string;
  readonly expenseId: string;
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
};

export async function loadFinancialsApOrgFactsBundle(
  db: DbExecutor,
  organizationId: string,
): Promise<FinancialsApFactsBundle> {
  const row = sqlFirstRow<{ payload: FinancialsApFactsBundle | null }>(
    await db.execute(sql`
      with candidate_bills as (
        select b.id
        from ap_bills b
        where b.organization_id = ${organizationId}::uuid
          and b.archived_at is null
      )
      select jsonb_build_object(
        'bills', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id,
            'projectId', b.project_id,
            'status', b.status,
            'totalAmount', b.total_amount,
            'netAmount', b.net_amount,
            'currency', b.currency,
            'retentionHeldRemaining', b.retention_held_remaining,
            'billDate', b.bill_date
          ))
          from ap_bills b
          where b.id in (select id from candidate_bills)
        ), '[]'::jsonb),
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'apBillId', a.ap_bill_id,
            'projectId', a.project_id,
            'amount', a.amount,
            'currency', a.currency,
            'targetType', a.target_type,
            'status', a.status
          ))
          from ap_bill_project_allocations a
          where a.organization_id = ${organizationId}::uuid
            and a.ap_bill_id in (select id from candidate_bills)
            and a.status = 'applied'
        ), '[]'::jsonb),
        'creditReductions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'apBillId', ca.ap_bill_id,
            'appliedGross', ca.amount,
            'currency', ca.currency,
            'creditNet', vc.net_amount,
            'creditGross', vc.gross_amount,
            'creditProjectId', vc.project_id
          ))
          from ap_credit_applications ca
          inner join ap_vendor_credits vc on vc.id = ca.credit_id
          where ca.organization_id = ${organizationId}::uuid
            and ca.ap_bill_id in (select id from candidate_bills)
            and ca.status = 'applied'
        ), '[]'::jsonb),
        'vendorPayments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'apBillId', pa.ap_bill_id,
            'amount', pa.applied_amount,
            'currency', pay.currency,
            'paymentStatus', pay.status
          ))
          from ap_payment_applications pa
          inner join ap_payments pay on pay.id = pa.ap_payment_id
          where pa.organization_id = ${organizationId}::uuid
            and pa.ap_bill_id in (select id from candidate_bills)
            and pay.status = 'recorded'
        ), '[]'::jsonb),
        'poMatches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'apBillId', m.ap_bill_id,
            'expenseId', m.expense_id,
            'matchedAmount', m.matched_amount,
            'expenseCurrency', e.currency
          ))
          from ap_po_matches m
          inner join expenses e on e.id = m.expense_id
          where m.organization_id = ${organizationId}::uuid
            and m.ap_bill_id in (select id from candidate_bills)
            and m.status = 'accepted'
            and m.expense_id is not null
            and e.status = 'finalized'
            and e.archived_at is null
        ), '[]'::jsonb)
      ) as payload
    `),
  );

  const payload = row?.payload;
  return {
    bills: payload?.bills ?? [],
    allocations: payload?.allocations ?? [],
    creditReductions: payload?.creditReductions ?? [],
    vendorPayments: payload?.vendorPayments ?? [],
    poMatches: payload?.poMatches ?? [],
  };
}

/** @deprecated Prefer loadFinancialsApOrgFactsBundle — project slice is folded in application layer. */
export async function loadFinancialsApFactsBundle(
  db: DbExecutor,
  organizationId: string,
  _projectId: string,
): Promise<FinancialsApFactsBundle> {
  return loadFinancialsApOrgFactsBundle(db, organizationId);
}

export type FinancialsProcurementBundle = {
  readonly committedAmount: string;
  readonly committedCurrency: string;
  readonly committedExcludedFx: number;
};

export async function loadFinancialsProcurementBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<FinancialsProcurementBundle> {
  const row = sqlFirstRow<{
    committedAmount: string;
    committedExcludedFx: number;
  }>(
    await db.execute(sql`
      select
        coalesce((
          select sum(cc.amount)::text
          from committed_costs cc
          where cc.organization_id = ${organizationId}::uuid
            and cc.project_id = ${projectId}::uuid
            and cc.status in ('open', 'partially_consumed')
            and upper(cc.currency) = upper(${currency})
        ), '0') as "committedAmount",
        coalesce((
          select count(*)::int
          from committed_costs cc
          where cc.organization_id = ${organizationId}::uuid
            and cc.project_id = ${projectId}::uuid
            and cc.status in ('open', 'partially_consumed')
            and upper(cc.currency) <> upper(${currency})
        ), 0) as "committedExcludedFx"
    `),
  );

  return {
    committedAmount: row?.committedAmount ?? '0',
    committedCurrency: currency,
    committedExcludedFx: row?.committedExcludedFx ?? 0,
  };
}

export type LaborAggregateRow = {
  readonly totalAmount: string;
  readonly entryCount: number;
  readonly entriesMissingCost: number;
  readonly excludedForeignCurrencyEntries: number;
};

export async function loadFinancialsLaborAggregateBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
  excludeYearMonth: string,
): Promise<{ readonly residual: LaborAggregateRow; readonly appliedPriorTotal: string }> {
  const row = sqlFirstRow<{
    residualTotal: string;
    entryCount: number;
    entriesMissingCost: number;
    excludedForeignCurrencyEntries: number;
    appliedPriorTotal: string;
  }>(
    await db.execute(sql`
      select
        coalesce((
          select sum(
            case
              when te.cost_amount is null then null
              when te.excess_hours is null or te.excess_hours = 0 then te.cost_amount
              when te.excess_approval_status = 'approved' then te.cost_amount
              else (te.cost_amount * (te.hours - te.excess_hours) / te.hours)::numeric
            end
          ) filter (where upper(te.cost_currency) = upper(${currency}))::text
          from time_entries te
          where te.organization_id = ${organizationId}::uuid
            and te.project_id = ${projectId}::uuid
            and te.kind = 'project'
            and te.status = 'recorded'
            and te.approval_status = 'approved'
            and te.archived_at is null
            and not exists (
              select 1 from employee_month_costs emc
              where emc.organization_id = te.organization_id
                and emc.employee_id = te.employee_id
                and emc.year_month = to_char(te.work_date::date, 'YYYY-MM')
                and emc.status in ('applied', 'closed')
                and emc.recognition_source = 'monthly_allocated'
            )
        ), '0') as "residualTotal",
        coalesce((
          select count(*)::int from time_entries te
          where te.organization_id = ${organizationId}::uuid
            and te.project_id = ${projectId}::uuid
            and te.kind = 'project'
            and te.status = 'recorded'
            and te.approval_status = 'approved'
            and te.archived_at is null
            and not exists (
              select 1 from employee_month_costs emc
              where emc.organization_id = te.organization_id
                and emc.employee_id = te.employee_id
                and emc.year_month = to_char(te.work_date::date, 'YYYY-MM')
                and emc.status in ('applied', 'closed')
                and emc.recognition_source = 'monthly_allocated'
            )
        ), 0) as "entryCount",
        coalesce((
          select count(*)::int from time_entries te
          where te.organization_id = ${organizationId}::uuid
            and te.project_id = ${projectId}::uuid
            and te.kind = 'project'
            and te.status = 'recorded'
            and te.approval_status = 'approved'
            and te.archived_at is null
            and te.cost_amount is null
            -- Residual hours only. Monthly-allocated months have no time-entry cost_amount
            -- by design; counting them as missing cost hid a complete project Actual.
            and not exists (
              select 1 from employee_month_costs emc
              where emc.organization_id = te.organization_id
                and emc.employee_id = te.employee_id
                and emc.year_month = to_char(te.work_date::date, 'YYYY-MM')
                and emc.status in ('applied', 'closed')
                and emc.recognition_source = 'monthly_allocated'
            )
        ), 0) as "entriesMissingCost",
        coalesce((
          select count(*)::int from time_entries te
          where te.organization_id = ${organizationId}::uuid
            and te.project_id = ${projectId}::uuid
            and te.kind = 'project'
            and te.status = 'recorded'
            and te.approval_status = 'approved'
            and te.archived_at is null
            and te.cost_currency is not null
            and upper(te.cost_currency) <> upper(${currency})
            and not exists (
              select 1 from employee_month_costs emc
              where emc.organization_id = te.organization_id
                and emc.employee_id = te.employee_id
                and emc.year_month = to_char(te.work_date::date, 'YYYY-MM')
                and emc.status in ('applied', 'closed')
                and emc.recognition_source = 'monthly_allocated'
            )
        ), 0) as "excludedForeignCurrencyEntries",
        coalesce((
          select sum(larl.amount)::text
          from labor_allocation_run_lines larl
          inner join labor_allocation_runs lar
            on lar.id = larl.labor_allocation_run_id and lar.organization_id = larl.organization_id
          inner join employee_month_costs emc
            on emc.id = lar.employee_month_cost_id and emc.organization_id = lar.organization_id
          where larl.organization_id = ${organizationId}::uuid
            and larl.project_id = ${projectId}::uuid
            and lar.status = 'applied'
            and emc.status in ('applied', 'closed')
            and emc.recognition_source = 'monthly_allocated'
            and emc.year_month <> ${excludeYearMonth}
            and upper(larl.currency) = upper(${currency})
        ), '0') as "appliedPriorTotal"
    `),
  );

  return {
    residual: {
      totalAmount: row?.residualTotal ?? '0',
      entryCount: row?.entryCount ?? 0,
      entriesMissingCost: row?.entriesMissingCost ?? 0,
      excludedForeignCurrencyEntries: row?.excludedForeignCurrencyEntries ?? 0,
    },
    appliedPriorTotal: row?.appliedPriorTotal ?? '0',
  };
}

export type GcmStoredBundle = {
  readonly storedBeforeCurrent: string;
  readonly storedCurrent: string;
  readonly futureCandidateMonths: readonly string[];
};

export async function loadFinancialsGcmStoredBundle(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
  throughYearMonth: string,
): Promise<GcmStoredBundle> {
  const row = sqlFirstRow<{
    storedBeforeCurrent: string;
    storedCurrent: string;
    futureCandidateMonths: string[] | null;
  }>(
    await db.execute(sql`
      select
        coalesce((
          select sum(gca.amount)::text
          from general_cost_month_allocations gca
          inner join general_cost_months gcm
            on gcm.id = gca.general_cost_month_id and gcm.organization_id = gca.organization_id
          where gca.organization_id = ${organizationId}::uuid
            and gca.project_id = ${projectId}::uuid
            and upper(gca.currency) = upper(${currency})
            and gcm.year_month < ${throughYearMonth}
            and gcm.status in ('open', 'frozen')
        ), '0') as "storedBeforeCurrent",
        coalesce((
          select sum(gca.amount)::text
          from general_cost_month_allocations gca
          inner join general_cost_months gcm
            on gcm.id = gca.general_cost_month_id and gcm.organization_id = gca.organization_id
          where gca.organization_id = ${organizationId}::uuid
            and gca.project_id = ${projectId}::uuid
            and upper(gca.currency) = upper(${currency})
            and gcm.year_month = ${throughYearMonth}
            and gcm.status in ('open', 'frozen')
        ), '0') as "storedCurrent",
        (select coalesce(jsonb_agg(distinct l.year_month order by l.year_month), '[]'::jsonb)
         from expense_managerial_schedule_lines l
         inner join expenses e on e.id = l.expense_id and e.organization_id = l.organization_id
         where l.organization_id = ${organizationId}::uuid
           and l.year_month > ${throughYearMonth}
           and l.status in ('scheduled', 'recognized')
           and e.status = 'finalized'
           and e.archived_at is null
           and coalesce(e.inventory_stock_purchase, false) = false
           and e.project_id is null
           and not exists (
             select 1 from expense_allocations ea
             where ea.expense_id = e.id and ea.organization_id = e.organization_id
               and ea.project_id is not null
           )
        ) as "futureCandidateMonths"
    `),
  );

  const futureRaw = row?.futureCandidateMonths;
  const futureCandidateMonths = Array.isArray(futureRaw)
    ? futureRaw.filter((ym): ym is string => typeof ym === 'string')
    : [];

  return {
    storedBeforeCurrent: row?.storedBeforeCurrent ?? '0',
    storedCurrent: row?.storedCurrent ?? '0',
    futureCandidateMonths,
  };
}
