/**
 * Production expense integrity audit (postgres-only; no drizzle schema / server-only).
 *
 * Usage:
 *   npx tsx scripts/.prod-expense-integrity-audit.ts --org <uuid> [--repair] [--json-out path]
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  isAllocationIntent,
  resolveExpenseAllocationIntent,
} from '@/modules/financials/domain/allocation-intent';

dotenv.config({ path: '.env.local', override: true });

const cs =
  process.env.EU_DIRECT_DATABASE_URL ??
  process.env.DIRECT_DATABASE_URL ??
  process.env.EU_DATABASE_URL ??
  process.env.DATABASE_URL ??
  '';

type IssueCode =
  | 'allocation_intent_mismatch'
  | 'project_id_with_multi_allocations'
  | 'company_only_with_project_allocations'
  | 'auto_pool_with_manual_project_allocations'
  | 'project_allocate_missing_attribution'
  | 'allocation_net_not_conserved'
  | 'allocation_percent_not_100'
  | 'reversal_treated_as_payable'
  | 'original_with_reversal_still_payable'
  | 'reversal_allocation_mismatch'
  | 'ambiguous_routing_requires_owner';

interface ExpenseRow {
  id: string;
  status: string;
  project_id: string | null;
  allocation_intent: string | null;
  net_amount: string;
  gross_amount: string;
  payment_status: string | null;
  voids_expense_id: string | null;
  cost_family: string | null;
  allocation_driver_method: string | null;
  expense_date: string;
  description: string | null;
  vendor_id: string | null;
  supplier_name: string | null;
}

interface AllocRow {
  expense_id: string;
  project_id: string | null;
  target_type: string;
  amount: string;
  method: string | null;
  percent: string | null;
}

interface Issue {
  expenseId: string;
  code: IssueCode;
  reason: string;
  proposedAction: string;
  autoRepairable: boolean;
  ambiguous: boolean;
}

function auditExpenses(expenses: ExpenseRow[], allocations: AllocRow[]): Issue[] {
  const allocationsByExpense = new Map<string, AllocRow[]>();
  for (const line of allocations) {
    const list = allocationsByExpense.get(line.expense_id) ?? [];
    list.push(line);
    allocationsByExpense.set(line.expense_id, list);
  }

  const reversalTargets = new Set(
    expenses.filter((row) => row.voids_expense_id).map((row) => row.voids_expense_id as string),
  );

  const issues: Issue[] = [];

  for (const row of expenses) {
    const lines = allocationsByExpense.get(row.id) ?? [];
    const projectLines = lines.filter((line) => line.target_type === 'project' && line.project_id);
    const storedIntent = row.allocation_intent;
    const hasExplicitIntent = isAllocationIntent(storedIntent);
    const intent = hasExplicitIntent ? storedIntent : (storedIntent ?? 'auto_pool');
    const routingInput = {
      projectId: row.project_id,
      usesAutomaticDriver: Boolean(row.allocation_driver_method),
      hasProjectAllocationLine: projectLines.length > 0,
      hasOverheadAllocationLine: lines.some((line) => line.target_type === 'overhead'),
      costFamily: row.cost_family ?? 'business_overhead',
    };
    const evidenceIntent = resolveExpenseAllocationIntent({
      ...routingInput,
      explicitIntent: null,
    });

    if (
      !hasExplicitIntent &&
      evidenceIntent !== intent &&
      projectLines.length === 0 &&
      !row.project_id &&
      (intent === 'company_only' || intent === 'auto_pool')
    ) {
      issues.push({
        expenseId: row.id,
        code: 'ambiguous_routing_requires_owner',
        reason: `allocationIntent=${intent} but evidence suggests ${evidenceIntent}`,
        proposedAction: 'Owner confirms routing via resolveExpenseRoutingAction',
        autoRepairable: false,
        ambiguous: true,
      });
    } else if (intent !== evidenceIntent && (projectLines.length > 0 || row.project_id)) {
      issues.push({
        expenseId: row.id,
        code: 'allocation_intent_mismatch',
        reason: `Stored intent ${intent} vs evidence ${evidenceIntent}`,
        proposedAction: `Set allocationIntent=${evidenceIntent}`,
        autoRepairable: row.status === 'draft',
        ambiguous: false,
      });
    }

    if (row.project_id && projectLines.length > 0) {
      issues.push({
        expenseId: row.id,
        code: 'project_id_with_multi_allocations',
        reason: 'Top-level projectId coexists with manual allocation lines',
        proposedAction: 'Clear projectId when multi-project lines exist',
        autoRepairable: row.status === 'draft',
        ambiguous: false,
      });
    }

    if (intent === 'company_only' && projectLines.length > 0) {
      issues.push({
        expenseId: row.id,
        code: 'company_only_with_project_allocations',
        reason: 'company_only expense has project allocation lines',
        proposedAction: 'Remove project allocation lines or change intent',
        autoRepairable: row.status === 'draft',
        ambiguous: row.status !== 'draft',
      });
    }

    if (intent === 'auto_pool' && projectLines.length > 0 && !row.allocation_driver_method) {
      issues.push({
        expenseId: row.id,
        code: 'auto_pool_with_manual_project_allocations',
        reason: 'auto_pool expense has explicit project lines without driver',
        proposedAction: 'Remove manual lines or set project_allocate intent',
        autoRepairable: row.status === 'draft',
        ambiguous: row.status !== 'draft',
      });
    }

    if (
      intent === 'project_allocate' &&
      !row.project_id &&
      projectLines.length === 0 &&
      row.status === 'finalized'
    ) {
      issues.push({
        expenseId: row.id,
        code: 'project_allocate_missing_attribution',
        reason: 'Finalized project_allocate without project or allocation lines',
        proposedAction: 'Add allocations or change intent',
        autoRepairable: false,
        ambiguous: true,
      });
    }

    if (projectLines.length > 0) {
      const net = Number(row.net_amount);
      const sum = projectLines.reduce((acc, line) => acc + Number(line.amount), 0);
      const overhead = lines
        .filter((line) => line.target_type === 'overhead')
        .reduce((acc, line) => acc + Number(line.amount), 0);
      if (Math.abs(net - (sum + overhead)) > 0.02) {
        issues.push({
          expenseId: row.id,
          code: 'allocation_net_not_conserved',
          reason: `NET ${net} vs allocated ${sum + overhead}`,
          proposedAction: 'Reconcile allocation lines to NET total',
          autoRepairable: false,
          ambiguous: true,
        });
      }

      const percentLines = projectLines.filter((line) => line.method === 'manual_percent');
      if (percentLines.length > 0) {
        const pct = percentLines.reduce((acc, line) => acc + Number(line.percent ?? 0), 0);
        if (Math.abs(pct - 100) > 0.05) {
          issues.push({
            expenseId: row.id,
            code: 'allocation_percent_not_100',
            reason: `Percent lines sum to ${pct}`,
            proposedAction: 'Adjust percent lines to 100%',
            autoRepairable: false,
            ambiguous: true,
          });
        }
      }
    }

    const openPaymentStatuses = new Set([
      'due',
      'overdue',
      'upcoming',
      'partially_paid',
      'legacy_unknown',
    ]);
    if (
      row.voids_expense_id &&
      row.status === 'finalized' &&
      row.payment_status != null &&
      openPaymentStatuses.has(row.payment_status)
    ) {
      issues.push({
        expenseId: row.id,
        code: 'reversal_treated_as_payable',
        reason: 'Reversal row has explicit open payment status',
        proposedAction: 'Clear payment status on reversal row',
        autoRepairable: row.status === 'draft',
        ambiguous: false,
      });
    }

    if (
      reversalTargets.has(row.id) &&
      row.status === 'finalized' &&
      Number(row.gross_amount) > 0 &&
      row.payment_status != null &&
      openPaymentStatuses.has(row.payment_status)
    ) {
      issues.push({
        expenseId: row.id,
        code: 'original_with_reversal_still_payable',
        reason: 'Original with active reversal still has explicit open payment status',
        proposedAction: 'Clear payment status; canonical reporting already excludes from outstanding',
        autoRepairable: false,
        ambiguous: false,
      });
    }
  }

  for (const reversal of expenses.filter((row) => row.voids_expense_id)) {
    const original = expenses.find((row) => row.id === reversal.voids_expense_id);
    if (!original) continue;
    const originalLines = allocationsByExpense.get(original.id) ?? [];
    const reversalLines = allocationsByExpense.get(reversal.id) ?? [];
    if (originalLines.length > 0 && reversalLines.length !== originalLines.length) {
      issues.push({
        expenseId: reversal.id,
        code: 'reversal_allocation_mismatch',
        reason: 'Reversal allocation line count differs from original',
        proposedAction: 'Regenerate reversal allocation mirror',
        autoRepairable: false,
        ambiguous: true,
      });
    }
  }

  return issues;
}

async function repairIssues(
  sql: postgres.Sql,
  orgId: string,
  issues: Issue[],
): Promise<{ repaired: number; skipped: number }> {
  let repaired = 0;
  let skipped = 0;

  for (const issue of issues) {
    if (!issue.autoRepairable) {
      skipped += 1;
      continue;
    }

    const [expense] = await sql<{ status: string }[]>`
      SELECT status FROM expenses
      WHERE id = ${issue.expenseId}::uuid AND organization_id = ${orgId}::uuid
    `;
    if (!expense || expense.status !== 'draft') {
      skipped += 1;
      continue;
    }

    if (issue.code === 'allocation_intent_mismatch') {
      const inferred = issue.proposedAction.match(/allocationIntent=(\w+)/)?.[1];
      if (!inferred) {
        skipped += 1;
        continue;
      }
      await sql`
        UPDATE expenses SET allocation_intent = ${inferred}, updated_at = now()
        WHERE id = ${issue.expenseId}::uuid AND organization_id = ${orgId}::uuid
      `;
      repaired += 1;
      continue;
    }

    if (issue.code === 'project_id_with_multi_allocations') {
      await sql`
        UPDATE expenses SET project_id = NULL, work_package_id = NULL, updated_at = now()
        WHERE id = ${issue.expenseId}::uuid AND organization_id = ${orgId}::uuid
      `;
      repaired += 1;
      continue;
    }

    if (
      issue.code === 'company_only_with_project_allocations' ||
      issue.code === 'auto_pool_with_manual_project_allocations'
    ) {
      await sql`
        DELETE FROM expense_allocations
        WHERE expense_id = ${issue.expenseId}::uuid AND organization_id = ${orgId}::uuid
      `;
      repaired += 1;
      continue;
    }

    skipped += 1;
  }

  return { repaired, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf('--org');
  const organizationId = orgIdx >= 0 ? args[orgIdx + 1] : process.env.AUDIT_ORG_ID;
  const repair = args.includes('--repair');
  const jsonOutIdx = args.indexOf('--json-out');
  const jsonOut = jsonOutIdx >= 0 ? args[jsonOutIdx + 1] : null;

  if (!organizationId || !cs) {
    console.error('Missing --org or DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [org] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM organizations WHERE id = ${organizationId}::uuid
    `;
    if (!org) throw new Error(`Organization not found: ${organizationId}`);

    const expenses = await sql<ExpenseRow[]>`
      SELECT
        e.id::text,
        e.status,
        e.project_id::text,
        e.allocation_intent,
        e.net_amount::text,
        e.gross_amount::text,
        e.payment_status,
        e.voids_expense_id::text,
        e.cost_family,
        e.allocation_driver_method,
        e.expense_date::text,
        e.description,
        e.vendor_id::text,
        e.supplier_name
      FROM expenses e
      WHERE e.organization_id = ${organizationId}::uuid AND e.archived_at IS NULL
      ORDER BY e.expense_date DESC
    `;

    const expenseIds = expenses.map((row) => row.id);
    const allocations =
      expenseIds.length > 0
        ? await sql<AllocRow[]>`
            SELECT
              ea.expense_id::text,
              ea.project_id::text,
              ea.target_type,
              ea.amount::text,
              ea.method,
              ea.percent::text
            FROM expense_allocations ea
            WHERE ea.organization_id = ${organizationId}::uuid
              AND ea.expense_id = ANY(${expenseIds}::uuid[])
          `
        : [];

    const [{ ap_count }] = await sql<{ ap_count: number }[]>`
      SELECT count(*)::int AS ap_count FROM ap_bills
      WHERE organization_id = ${organizationId}::uuid AND archived_at IS NULL
    `;

    const beforeIssues = auditExpenses(expenses, allocations);
    let repairResult = { repaired: 0, skipped: 0 };
    let afterIssues = beforeIssues;

    if (repair && beforeIssues.some((issue) => issue.autoRepairable)) {
      repairResult = await repairIssues(
        sql,
        organizationId,
        beforeIssues.filter((issue) => issue.autoRepairable),
      );
      const expensesAfter = await sql<ExpenseRow[]>`
        SELECT
          e.id::text, e.status, e.project_id::text, e.allocation_intent,
          e.net_amount::text, e.gross_amount::text, e.payment_status,
          e.voids_expense_id::text, e.cost_family, e.allocation_driver_method,
          e.expense_date::text, e.description, e.vendor_id::text, e.supplier_name
        FROM expenses e
        WHERE e.organization_id = ${organizationId}::uuid AND e.archived_at IS NULL
      `;
      const idsAfter = expensesAfter.map((row) => row.id);
      const allocationsAfter =
        idsAfter.length > 0
          ? await sql<AllocRow[]>`
              SELECT ea.expense_id::text, ea.project_id::text, ea.target_type,
                     ea.amount::text, ea.method, ea.percent::text
              FROM expense_allocations ea
              WHERE ea.organization_id = ${organizationId}::uuid
                AND ea.expense_id = ANY(${idsAfter}::uuid[])
            `
          : [];
      afterIssues = auditExpenses(expensesAfter, allocationsAfter);
    }

    const expenseById = new Map(expenses.map((row) => [row.id, row]));
    const enriched = afterIssues.map((issue) => {
      const row = expenseById.get(issue.expenseId);
      return {
        ...issue,
        expenseDate: row?.expense_date ?? null,
        netAmount: row?.net_amount ?? null,
        description: row?.description ?? null,
        vendorId: row?.vendor_id ?? null,
        supplierName: row?.supplier_name ?? null,
        status: row?.status ?? null,
        allocationIntent: row?.allocation_intent ?? null,
        projectId: row?.project_id ?? null,
      };
    });

    const report = {
      organizationId: org.id,
      organizationName: org.name,
      expensesScanned: expenses.length,
      apBillsScanned: ap_count,
      allocationRowsScanned: allocations.length,
      phase: repair ? 'after_repair' : 'before',
      anomaliesBefore: beforeIssues.length,
      autoRepairableBefore: beforeIssues.filter((i) => i.autoRepairable).length,
      ambiguousBefore: beforeIssues.filter((i) => i.ambiguous).length,
      repair: repairResult,
      anomaliesAfter: afterIssues.length,
      actionableAfter: afterIssues.filter((i) => i.autoRepairable || i.ambiguous).length,
      issues: enriched,
    };

    const output = JSON.stringify(report, null, 2);
    console.log(output);
    if (jsonOut) writeFileSync(jsonOut, output, 'utf8');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
