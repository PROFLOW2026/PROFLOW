import { and, eq, inArray, isNull } from 'drizzle-orm';
import { expenseAllocations, expenses } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import {
  isAllocationIntent,
  resolveExpenseAllocationIntent,
} from '@/modules/financials/domain/allocation-intent';
import { findExpenseById, replaceExpenseAllocations, updateExpenseRow } from '../data/expenses.repository';

export type ExpenseIntegrityIssueCode =
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

export interface ExpenseIntegrityIssue {
  readonly expenseId: string;
  readonly code: ExpenseIntegrityIssueCode;
  readonly reason: string;
  readonly proposedAction: string;
  readonly autoRepairable: boolean;
  readonly ambiguous: boolean;
}

export interface ExpenseIntegrityAuditResult {
  readonly scanned: number;
  readonly issues: readonly ExpenseIntegrityIssue[];
  readonly autoRepairableCount: number;
  readonly ownerResolutionCount: number;
}

export async function auditExpenseIntegrity(context: OrgContext): Promise<ExpenseIntegrityAuditResult> {
  const rows = await context.db
    .select({
      id: expenses.id,
      status: expenses.status,
      projectId: expenses.projectId,
      allocationIntent: expenses.allocationIntent,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      paymentStatus: expenses.paymentStatus,
      voidsExpenseId: expenses.voidsExpenseId,
      costFamily: expenses.costFamily,
      allocationDriverMethod: expenses.allocationDriverMethod,
    })
    .from(expenses)
    .where(and(eq(expenses.organizationId, context.organizationId), isNull(expenses.archivedAt)))
    .limit(5000);

  const expenseIds = rows.map((row) => row.id);
  const allocationRows =
    expenseIds.length > 0
      ? await context.db
          .select({
            expenseId: expenseAllocations.expenseId,
            projectId: expenseAllocations.projectId,
            targetType: expenseAllocations.targetType,
            amount: expenseAllocations.amount,
            method: expenseAllocations.method,
            percent: expenseAllocations.percent,
          })
          .from(expenseAllocations)
          .where(
            and(
              eq(expenseAllocations.organizationId, context.organizationId),
              inArray(expenseAllocations.expenseId, expenseIds),
            ),
          )
      : [];

  const allocationsByExpense = new Map<string, typeof allocationRows>();
  for (const line of allocationRows) {
    const list = allocationsByExpense.get(line.expenseId) ?? [];
    list.push(line);
    allocationsByExpense.set(line.expenseId, list);
  }

  const reversalTargets = new Set(
    rows.filter((row) => row.voidsExpenseId).map((row) => row.voidsExpenseId as string),
  );

  const issues: ExpenseIntegrityIssue[] = [];

  for (const row of rows) {
    const lines = allocationsByExpense.get(row.id) ?? [];
    const projectLines = lines.filter((line) => line.targetType === 'project' && line.projectId);
    const storedIntent = row.allocationIntent;
    const hasExplicitIntent = isAllocationIntent(storedIntent);
    const intent = hasExplicitIntent ? storedIntent : (storedIntent ?? 'auto_pool');
    const routingInput = {
      projectId: row.projectId,
      usesAutomaticDriver: Boolean(row.allocationDriverMethod),
      hasProjectAllocationLine: projectLines.length > 0,
      hasOverheadAllocationLine: lines.some((line) => line.targetType === 'overhead'),
      costFamily: row.costFamily ?? 'business_overhead',
    };
    const evidenceIntent = resolveExpenseAllocationIntent({
      ...routingInput,
      explicitIntent: null,
    });

    if (
      !hasExplicitIntent &&
      evidenceIntent !== intent &&
      projectLines.length === 0 &&
      !row.projectId &&
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
    } else if (intent !== evidenceIntent && (projectLines.length > 0 || row.projectId)) {
      issues.push({
        expenseId: row.id,
        code: 'allocation_intent_mismatch',
        reason: `Stored intent ${intent} vs evidence ${evidenceIntent}`,
        proposedAction: `Set allocationIntent=${evidenceIntent}`,
        autoRepairable: row.status === 'draft',
        ambiguous: false,
      });
    }

    if (row.projectId && projectLines.length > 0) {
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

    if (intent === 'auto_pool' && projectLines.length > 0 && !row.allocationDriverMethod) {
      issues.push({
        expenseId: row.id,
        code: 'auto_pool_with_manual_project_allocations',
        reason: 'auto_pool expense has explicit project lines without driver',
        proposedAction: 'Remove manual lines or set project_allocate intent',
        autoRepairable: row.status === 'draft',
        ambiguous: row.status !== 'draft',
      });
    }

    if (intent === 'project_allocate' && !row.projectId && projectLines.length === 0 && row.status === 'finalized') {
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
      const net = Number(row.netAmount);
      const sum = projectLines.reduce((acc, line) => acc + Number(line.amount), 0);
      const overhead = lines
        .filter((line) => line.targetType === 'overhead')
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
      row.voidsExpenseId &&
      row.status === 'finalized' &&
      row.paymentStatus != null &&
      openPaymentStatuses.has(row.paymentStatus)
    ) {
      issues.push({
        expenseId: row.id,
        code: 'reversal_treated_as_payable',
        reason: 'Reversal row has explicit open payment status',
        proposedAction: 'Clear payment status on reversal row',
        autoRepairable: false,
        ambiguous: false,
      });
    }

    if (
      reversalTargets.has(row.id) &&
      row.status === 'finalized' &&
      Number(row.grossAmount) > 0 &&
      row.paymentStatus != null &&
      openPaymentStatuses.has(row.paymentStatus)
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

  for (const reversal of rows.filter((row) => row.voidsExpenseId)) {
    const original = rows.find((row) => row.id === reversal.voidsExpenseId);
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

  return {
    scanned: rows.length,
    issues,
    autoRepairableCount: issues.filter((issue) => issue.autoRepairable).length,
    ownerResolutionCount: issues.filter((issue) => issue.ambiguous).length,
  };
}

export async function repairExpenseIntegrityIssues(
  context: OrgContext,
  issues: readonly ExpenseIntegrityIssue[],
): Promise<{ readonly repaired: number; readonly skipped: number }> {
  let repaired = 0;
  let skipped = 0;

  for (const issue of issues) {
    if (!issue.autoRepairable) {
      skipped += 1;
      continue;
    }

    const expense = await findExpenseById(context.db, context.organizationId, issue.expenseId);
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
      await updateExpenseRow(context.db, context.organizationId, issue.expenseId, {
        allocationIntent: inferred as 'project_allocate' | 'auto_pool' | 'company_only',
      });
      repaired += 1;
      continue;
    }

    if (issue.code === 'project_id_with_multi_allocations') {
      await updateExpenseRow(context.db, context.organizationId, issue.expenseId, {
        projectId: null,
        workPackageId: null,
      });
      repaired += 1;
      continue;
    }

    if (issue.code === 'company_only_with_project_allocations') {
      await replaceExpenseAllocations(context.db, context.organizationId, issue.expenseId, []);
      repaired += 1;
      continue;
    }

    if (issue.code === 'auto_pool_with_manual_project_allocations') {
      await replaceExpenseAllocations(context.db, context.organizationId, issue.expenseId, []);
      repaired += 1;
      continue;
    }

    skipped += 1;
  }

  if (repaired > 0) {
    try {
      const { recordAuditEvent } = await import('@/shared/audit');
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.EXPENSE_INTEGRITY_REPAIR,
        entityType: 'expense',
        entityId: context.organizationId,
        metadata: { repaired, skipped },
      });
    } catch {
      // Script / non-server runtime: repair still committed; audit optional.
    }
  }

  return { repaired, skipped };
}

export async function resolveExpenseRoutingAction(
  context: OrgContext,
  input: {
    readonly expenseId: string;
    readonly allocationIntent: 'project_allocate' | 'auto_pool' | 'company_only';
    readonly clearProjectId?: boolean;
    readonly clearAllocations?: boolean;
  },
): Promise<void> {
  const expense = await findExpenseById(context.db, context.organizationId, input.expenseId);
  if (!expense) throw new Error('Expense not found');
  if (expense.status !== 'draft') {
    throw new Error('Only draft expenses can be routing-resolved in place');
  }

  await updateExpenseRow(context.db, context.organizationId, input.expenseId, {
    allocationIntent: input.allocationIntent,
    ...(input.clearProjectId ? { projectId: null, workPackageId: null } : {}),
  });

  if (input.clearAllocations) {
    await replaceExpenseAllocations(context.db, context.organizationId, input.expenseId, []);
  }

  try {
    const { recordAuditEvent } = await import('@/shared/audit');
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.EXPENSE_ROUTING_RESOLVED,
      entityType: 'expense',
      entityId: input.expenseId,
      after: { allocationIntent: input.allocationIntent },
    });
  } catch {
    // Script / non-server runtime.
  }
}
