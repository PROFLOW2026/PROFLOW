import {
  assertVendorInOrganization,
  insertApBill,
  insertApBillLines,
  resolveApBillTaxSplit,
} from '@/modules/ap';
import { allocateApLineMonetarySplits } from '@/modules/ap/domain/bill-line-monetary';
import { createBillingRecord } from '@/modules/billing';
import { createExpense, finalizeExpense, findExpenseById } from '@/modules/expenses';
import { isMonthClosed, yearMonthFromBusinessDate } from '@/modules/month-close';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { resolveAllocatedReference } from '@/modules/tenancy';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanManageDraftKind } from '../domain/permissions';
import { assertDraftGeneratable } from '../domain/lifecycle';
import {
  assertGeneratedEntityIsDraft,
  billingInputFromPayload,
  expenseInputFromPayload,
  extractTemplateAmount,
  vendorBillDraftInsertFromPayload,
  withResolvedAmount,
} from '../domain/payload';
import { applyManagerialCostKindToExpensePayload } from '../domain/managerial-cost';
import { resolveAmountForDate, yearMonthFromBusinessDate as draftYearMonth, firstBusinessDateOfYearMonth } from '../domain/amount-versions';
import { bumpScheduleAfterGenerate } from '../domain/schedule';
import type { RecurringOccurrenceOutcome } from '../domain/occurrence-outcome';
import type {
  DraftKind,
  ExpenseDraftPayload,
  RecurringDraftAmountVersionRecord,
  RecurringFinancialDraftRecord,
  StoredDraftPayload,
} from '../domain/types';
import {
  findRecurringDraftById,
  findRunByDraftAndDate,
  findRunByDraftAndYearMonth,
  insertRecurringDraftRun,
  listAmountVersionsForDraft,
  updateRecurringDraftById,
} from '../data/recurring-drafts.repository';
import { generateRecurringDraftSchema } from '../validation/schemas';
import { parseStoredPayload } from './parse-payload';
import { hasExplicitRecurringCategory } from './resolve-expense-category';

export interface GenerateRecurringDraftResult {
  readonly draftId: string;
  readonly runDate: string;
  readonly occurrenceYearMonth: string | null;
  readonly generatedEntityType: DraftKind;
  readonly generatedEntityId: string;
  readonly generatedStatus: 'draft' | 'finalized';
  readonly outcome: RecurringOccurrenceOutcome;
  readonly nextRunDate: string;
  readonly templateStatus: string;
  readonly finalized: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

function occurrenceYearMonthForDraft(
  draft: RecurringFinancialDraftRecord,
  runDate: BusinessDate,
): string | null {
  if (draft.frequency !== 'monthly') return null;
  return draftYearMonth(runDate);
}

function applyResolvedPayload(
  draft: RecurringFinancialDraftRecord,
  payload: StoredDraftPayload,
  versions: readonly RecurringDraftAmountVersionRecord[],
  runDate: BusinessDate,
): StoredDraftPayload {
  const fallback = extractTemplateAmount(payload);
  const resolved = resolveAmountForDate(versions, runDate, fallback);
  let next = withResolvedAmount(payload, resolved.amount, resolved.currency);

  if (next.kind === 'expense') {
    next = {
      kind: 'expense',
      data: applyManagerialCostKindToExpensePayload(next.data, draft.managerialCostKind),
    };
  }
  return next;
}

function blockedOccurrenceResult(
  draft: RecurringFinancialDraftRecord,
  runDate: BusinessDate,
  occurrenceYearMonth: string | null,
  outcome: RecurringOccurrenceOutcome,
): GenerateRecurringDraftResult {
  return {
    draftId: draft.id,
    runDate,
    occurrenceYearMonth,
    generatedEntityType: draft.draftKind,
    generatedEntityId: '',
    generatedStatus: 'draft',
    outcome,
    nextRunDate: draft.nextRunDate,
    templateStatus: draft.status,
    finalized: false,
  };
}

async function tryFinalizeRecurringExpense(
  context: OrgContext,
  draft: RecurringFinancialDraftRecord,
  expenseId: string,
  runDate: BusinessDate,
  expensePayload: ExpenseDraftPayload,
): Promise<RecurringOccurrenceOutcome> {
  if (draft.draftKind !== 'expense' || !draft.autoFinalizeExpense) return 'draft';
  if (!hasExplicitRecurringCategory(expensePayload)) return 'blocked_missing_category';

  const ym = yearMonthFromBusinessDate(runDate);
  if (await isMonthClosed(context, ym)) return 'blocked_closed';

  await finalizeExpense(context, expenseId);
  return 'finalized';
}

async function createDraftEntity(
  context: OrgContext,
  kind: DraftKind,
  payload: StoredDraftPayload,
  runDate: BusinessDate,
  templateTitle: string,
  _draft: RecurringFinancialDraftRecord,
): Promise<{ id: string; status: string }> {
  switch (kind) {
    case 'expense': {
      assertPermission(context, PERMISSIONS.EXPENSES_CREATE);
      if (payload.kind !== 'expense') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const input = expenseInputFromPayload(payload.data, runDate);
      const note = `Generated from recurring draft “${templateTitle}”.`;
      const created = await createExpense(context, {
        ...input,
        notes: [input.notes?.trim() || null, note].filter(Boolean).join('\n'),
      });
      return { id: created.id, status: created.status };
    }
    case 'vendor_bill': {
      if (payload.kind !== 'vendor_bill') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const insert = vendorBillDraftInsertFromPayload(payload.data, runDate, templateTitle);
      const vendorOk = await assertVendorInOrganization(
        context.db,
        context.organizationId,
        insert.vendorId,
      );
      if (!vendorOk) throw new NotFoundError('Vendor');

      const taxSplit = resolveApBillTaxSplit({
        enteredAmount: insert.totalAmount,
        currency: insert.currency,
        amountIncludesTax: false,
      });

      const bill = await insertApBill(context.db, {
        organizationId: context.organizationId,
        vendorId: insert.vendorId,
        projectId: insert.projectId,
        purchaseOrderId: null,
        reference: await resolveAllocatedReference(context, 'vendor_bill', insert.reference),
        status: 'draft',
        billDate: insert.billDate,
        dueDate: insert.dueDate,
        currency: insert.currency,
        totalAmount: taxSplit.totalAmount,
        netAmount: taxSplit.netAmount,
        taxAmount: taxSplit.taxAmount,
        grossAmount: taxSplit.grossAmount,
        amountIncludesTax: taxSplit.amountIncludesTax,
        taxSnapshot: taxSplit.taxSnapshot,
        taxBasis: taxSplit.taxBasis,
        notes: insert.notes,
      });

      if (bill.status !== 'draft') {
        throw new DomainRuleError(
          'Vendor bill insert did not remain draft',
          'recurringDrafts.errors.mustRemainDraft',
        );
      }

      const lineSplits = allocateApLineMonetarySplits({
        currency: insert.currency,
        billNetAmount: taxSplit.netAmount,
        billTaxAmount: taxSplit.taxAmount,
        billGrossAmount: taxSplit.grossAmount,
        lineAmountBasis: taxSplit.amountIncludesTax === true ? 'gross' : 'net',
        lines: insert.lines,
      });

      await insertApBillLines(
        context.db,
        insert.lines.map((line, index) => {
          const monetary = lineSplits[index]!;
          return {
            organizationId: context.organizationId,
            apBillId: bill.id,
            description: line.description,
            quantity: line.quantity,
            unitAmount: line.unitAmount,
            lineTotal: monetary.grossAmount,
            netAmount: monetary.netAmount,
            taxAmount: monetary.taxAmount,
            grossAmount: monetary.grossAmount,
            currency: line.currency,
            purchaseOrderLineId: null,
            sortOrder: index,
          };
        }),
      );

      return { id: bill.id, status: bill.status };
    }
    case 'billing_record': {
      if (payload.kind !== 'billing_record') {
        throw new DomainRuleError('Payload kind mismatch', 'recurringDrafts.errors.kindMismatch');
      }
      const input = billingInputFromPayload(payload.data, runDate);
      const note = `Generated from recurring draft “${templateTitle}”. Draft only.`;
      const created = await createBillingRecord(context, {
        ...input,
        notes: [input.notes?.trim() || null, note].filter(Boolean).join('\n'),
        finalize: false,
      });
      return { id: created.id, status: created.status };
    }
  }
}

export interface GenerateOccurrenceOptions {
  readonly runDate: BusinessDate;
  readonly bumpSchedule: boolean;
  readonly notes: string;
  /** When true, skip if month already has a run (monthly) without throwing. */
  readonly skipIfMonthExists?: boolean;
}

/**
 * Shared occurrence create path used by generate-now and retro history.
 * Always inserts a draft entity first; may finalize expense when policy allows.
 */
export async function generateRecurringDraftOccurrence(
  context: OrgContext,
  draft: RecurringFinancialDraftRecord,
  options: GenerateOccurrenceOptions,
): Promise<GenerateRecurringDraftResult | null> {
  assertCanManageDraftKind(context, draft.draftKind);
  assertDraftGeneratable(draft.status);

  const runDate = businessDate(options.runDate);
  const occurrenceYearMonth = occurrenceYearMonthForDraft(draft, runDate);

  if (occurrenceYearMonth) {
    const monthHit = await findRunByDraftAndYearMonth(
      context.db,
      context.organizationId,
      draft.id,
      occurrenceYearMonth,
    );
    if (monthHit) {
      if (options.skipIfMonthExists) return null;
      throw new ConflictError(
        'A draft was already generated for this template month',
        'recurringDrafts.errors.alreadyGeneratedThisMonth',
      );
    }
  }

  const already = await findRunByDraftAndDate(
    context.db,
    context.organizationId,
    draft.id,
    runDate,
  );
  if (already) {
    if (options.skipIfMonthExists) return null;
    throw new ConflictError(
      'A draft was already generated for this template today',
      'recurringDrafts.errors.alreadyGeneratedToday',
    );
  }

  const basePayload = parseStoredPayload(draft.draftKind, draft.payloadJson);
  const versions = await listAmountVersionsForDraft(
    context.db,
    context.organizationId,
    draft.id,
  );
  const payload = applyResolvedPayload(draft, basePayload, versions, runDate);

  if (
    draft.autoFinalizeExpense &&
    payload.kind === 'expense' &&
    !hasExplicitRecurringCategory(payload.data)
  ) {
    return blockedOccurrenceResult(draft, runDate, occurrenceYearMonth, 'blocked_missing_category');
  }

  try {
    return await withTransaction(context.db, async (tx) => {
      const txContext: OrgContext = { ...context, db: tx };
      const created = await createDraftEntity(
        txContext,
        draft.draftKind,
        payload,
        runDate,
        draft.title,
        draft,
      );
      assertGeneratedEntityIsDraft({ kind: draft.draftKind, status: created.status });

      let generatedStatus: 'draft' | 'finalized' = 'draft';
      let finalized = false;
      let outcome: RecurringOccurrenceOutcome = 'draft';

      if (draft.draftKind === 'expense' && payload.kind === 'expense') {
        outcome = await tryFinalizeRecurringExpense(
          txContext,
          draft,
          created.id,
          runDate,
          payload.data,
        );
        if (outcome === 'finalized') {
          generatedStatus = 'finalized';
          finalized = true;
        }
      }

      await insertRecurringDraftRun(tx, {
        organizationId: context.organizationId,
        draftId: draft.id,
        runDate,
        occurrenceYearMonth,
        generatedEntityType: draft.draftKind,
        generatedEntityId: created.id,
        notes: options.notes,
      });

      let nextRunDate = draft.nextRunDate;
      let templateStatus = draft.status;

      if (options.bumpSchedule) {
        const bumped = bumpScheduleAfterGenerate({
          currentNextRunDate: draft.nextRunDate,
          runDate,
          frequency: draft.frequency,
          intervalCount: draft.intervalCount,
          endDate: draft.endDate,
        });
        nextRunDate = bumped.nextRunDate;
        templateStatus = bumped.status;

        const updated = await updateRecurringDraftById(tx, context.organizationId, draft.id, {
          nextRunDate: bumped.nextRunDate,
          status: bumped.status,
          lastGeneratedAt: new Date(),
        });
        if (!updated) throw new NotFoundError('Recurring draft');
      } else {
        await updateRecurringDraftById(tx, context.organizationId, draft.id, {
          lastGeneratedAt: new Date(),
        });
      }

      await recordAuditEvent(txContext, {
        action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_GENERATED,
        entityType: 'recurring_financial_draft',
        entityId: draft.id,
        after: {
          generatedEntityType: draft.draftKind,
          generatedEntityId: created.id,
          generatedStatus,
          runDate,
          occurrenceYearMonth,
          nextRunDate,
          posted: false,
          finalized,
        },
      });

      return {
        draftId: draft.id,
        runDate,
        occurrenceYearMonth,
        generatedEntityType: draft.draftKind,
        generatedEntityId: created.id,
        generatedStatus,
        outcome,
        nextRunDate,
        templateStatus,
        finalized,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (occurrenceYearMonth) {
        throw new ConflictError(
          'A draft was already generated for this template month',
          'recurringDrafts.errors.alreadyGeneratedThisMonth',
        );
      }
      throw new ConflictError(
        'A draft was already generated for this template today',
        'recurringDrafts.errors.alreadyGeneratedToday',
      );
    }
    throw error;
  }
}

/**
 * When a month already has a generated draft expense, finalize it instead of creating a duplicate.
 */
export async function finalizeExistingRecurringMonthOccurrence(
  context: OrgContext,
  draft: RecurringFinancialDraftRecord,
  yearMonth: string,
): Promise<GenerateRecurringDraftResult | null> {
  if (!draft.autoFinalizeExpense || draft.draftKind !== 'expense') return null;

  const existingRun = await findRunByDraftAndYearMonth(
    context.db,
    context.organizationId,
    draft.id,
    yearMonth,
  );
  if (!existingRun) return null;

  const expense = await findExpenseById(
    context.db,
    context.organizationId,
    existingRun.generatedEntityId,
  );
  if (!expense || expense.status !== 'draft') return null;

  const basePayload = parseStoredPayload(draft.draftKind, draft.payloadJson);
  const versions = await listAmountVersionsForDraft(
    context.db,
    context.organizationId,
    draft.id,
  );
  const runDate = businessDate(firstBusinessDateOfYearMonth(yearMonth));
  const payload = applyResolvedPayload(draft, basePayload, versions, runDate);
  if (payload.kind !== 'expense') return null;
  if (!hasExplicitRecurringCategory(payload.data)) {
    return blockedOccurrenceResult(draft, runDate, yearMonth, 'blocked_missing_category');
  }

  const outcome = await tryFinalizeRecurringExpense(
    context,
    draft,
    expense.id,
    runDate,
    payload.data,
  );
  if (outcome === 'finalized') {
    return {
      draftId: draft.id,
      runDate,
      occurrenceYearMonth: yearMonth,
      generatedEntityType: draft.draftKind,
      generatedEntityId: expense.id,
      generatedStatus: 'finalized',
      outcome: 'finalized',
      nextRunDate: draft.nextRunDate,
      templateStatus: draft.status,
      finalized: true,
    };
  }

  return blockedOccurrenceResult(draft, runDate, yearMonth, outcome);
}

/**
 * Creates one expense / vendor bill / billing record from the template for today.
 * Draft first; optional expense finalize when auto_finalize_expense and month open.
 */
export async function generateRecurringDraftNow(
  context: OrgContext,
  raw: { readonly draftId: string },
): Promise<GenerateRecurringDraftResult> {
  const parsed = generateRecurringDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurringDraftById(
    context.db,
    context.organizationId,
    parsed.data.draftId,
  );
  if (!existing) throw new NotFoundError('Recurring draft');

  const runDate = todayInTimeZone(context.organization.timezone);
  const result = await generateRecurringDraftOccurrence(context, existing, {
    runDate,
    bumpSchedule: true,
    notes: existing.autoFinalizeExpense
      ? 'Manual generate-now — may finalize expense when month is open.'
      : 'Manual generate-now - draft only, not posted.',
  });
  if (!result) {
    throw new ConflictError(
      'A draft was already generated for this template today',
      'recurringDrafts.errors.alreadyGeneratedToday',
    );
  }
  return result;
}
