import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  assertCanManageDraftKind,
  assertCanReadDraftKind,
} from '../domain/permissions';
import { assertScheduleRange } from '../domain/schedule';
import {
  assertDraftEditable,
  assertDraftEndable,
  assertDraftPausable,
  assertDraftResumable,
} from '../domain/lifecycle';
import { extractTemplateAmount, stripFinalizeFlag } from '../domain/payload';
import {
  applyManagerialCostKindToExpensePayload,
  isManagerialCostKind,
  type ManagerialCostKind,
} from '../domain/managerial-cost';
import type { RecurringFinancialDraftRecord, StoredDraftPayload } from '../domain/types';
import {
  findRecurringDraftById,
  insertRecurringDraft,
  updateRecurringDraftById,
} from '../data/recurring-drafts.repository';
import {
  createRecurringDraftSchema,
  recurringDraftIdSchema,
  updateRecurringDraftSchema,
  type CreateRecurringDraftInput,
  type UpdateRecurringDraftInput,
} from '../validation/schemas';
import {
  openInitialAmountVersion,
  rotateAmountVersionIfChanged,
} from './amount-versions';
import { generateRecurringDraftHistory } from './generate-history';
import type { HistoryOutcomeSummary } from '../domain/occurrence-outcome';
import { parseStoredPayload } from './parse-payload';
import { hasExplicitRecurringCategory } from './resolve-expense-category';
import {
  nextRunDateAfterRetro,
  retroMonthRangeFromStart,
} from '../domain/missing-months';

async function requireDraft(
  context: OrgContext,
  draftId: string,
): Promise<RecurringFinancialDraftRecord> {
  const draft = await findRecurringDraftById(context.db, context.organizationId, draftId);
  if (!draft) throw new NotFoundError('Recurring draft');
  return draft;
}

function resolveManagerialCostKind(
  draftKind: string,
  raw: string | null | undefined,
): ManagerialCostKind | null {
  if (raw == null || raw === '') return null;
  if (!isManagerialCostKind(raw)) {
    throw new ValidationError(
      [{ path: 'managerialCostKind', message: 'Invalid managerial cost kind' }],
      'Invalid managerial cost kind',
    );
  }
  if (draftKind !== 'expense') {
    throw new DomainRuleError(
      'Managerial cost kind applies only to expense templates',
      'recurringDrafts.errors.managerialCostExpenseOnly',
    );
  }
  return raw;
}

function shapeExpensePayloadForManagerial(
  payload: StoredDraftPayload,
  managerialCostKind: ManagerialCostKind | null,
): StoredDraftPayload {
  if (payload.kind !== 'expense') return payload;
  return {
    kind: 'expense',
    data: applyManagerialCostKindToExpensePayload(payload.data, managerialCostKind),
  };
}

export async function createRecurringDraft(
  context: OrgContext,
  raw: CreateRecurringDraftInput & { readonly generateRetroMonths?: boolean },
): Promise<{
  readonly draft: RecurringFinancialDraftRecord;
  readonly retroSummary: HistoryOutcomeSummary | null;
}> {
  const parsed = createRecurringDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertCanManageDraftKind(context, input.draftKind);
  assertScheduleRange(input.nextRunDate, input.endDate ?? null);

  const managerialCostKind = resolveManagerialCostKind(
    input.draftKind,
    input.managerialCostKind ?? null,
  );
  const autoFinalizeExpense =
    input.draftKind === 'expense'
      ? input.autoFinalizeExpense !== false
      : false;

  let payload = parseStoredPayload(input.draftKind, stripFinalizeFlag(input.payload));
  payload = shapeExpensePayloadForManagerial(payload, managerialCostKind);
  if (input.draftKind === 'expense' && payload.kind === 'expense' && !hasExplicitRecurringCategory(payload.data)) {
    throw new ValidationError(
      [{ path: 'costCategoryId', message: 'Cost category is required' }],
      'Cost category is required',
    );
  }
  const stored = payload.data;

  const draft = await insertRecurringDraft(context.db, {
    organizationId: context.organizationId,
    draftKind: input.draftKind,
    title: input.title,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    nextRunDate: businessDate(input.nextRunDate),
    endDate: input.endDate ? businessDate(input.endDate) : null,
    payloadJson: stored,
    status: 'active',
    autoFinalizeExpense,
    managerialCostKind,
  });

  const amount = extractTemplateAmount(payload);
  if (input.draftKind === 'expense') {
    await openInitialAmountVersion(context.db, {
      organizationId: context.organizationId,
      draftId: draft.id,
      amount: amount.amount,
      currency: amount.currency,
      validFrom: todayInTimeZone(context.organization.timezone),
    });
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_CREATED,
    entityType: 'recurring_financial_draft',
    entityId: draft.id,
    after: {
      id: draft.id,
      draftKind: draft.draftKind,
      status: draft.status,
      nextRunDate: draft.nextRunDate,
      autoFinalizeExpense: draft.autoFinalizeExpense,
      managerialCostKind: draft.managerialCostKind,
    },
  });

  let retroSummary: HistoryOutcomeSummary | null = null;

  if (
    raw.generateRetroMonths &&
    draft.draftKind === 'expense' &&
    draft.frequency === 'monthly'
  ) {
    const today = todayInTimeZone(context.organization.timezone);
    const range = retroMonthRangeFromStart(draft.nextRunDate, today, draft.endDate);
    if (range && range.count > 0) {
      const history = await generateRecurringDraftHistory(context, draft.id, {
        fromYearMonth: range.fromYearMonth,
        toYearMonth: range.toYearMonth,
      });
      retroSummary = history.summary;
      const nextRun = nextRunDateAfterRetro(
        range.toYearMonth,
        draft.nextRunDate,
        draft.frequency,
        draft.intervalCount,
      );
      const updated = await updateRecurringDraftById(context.db, context.organizationId, draft.id, {
        nextRunDate: nextRun,
      });
      if (updated) return { draft: updated, retroSummary };
    }
  }

  return { draft, retroSummary };
}

export async function updateRecurringDraft(
  context: OrgContext,
  raw: UpdateRecurringDraftInput,
): Promise<RecurringFinancialDraftRecord> {
  const parsed = updateRecurringDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await requireDraft(context, input.draftId);
  assertCanManageDraftKind(context, existing.draftKind);
  assertDraftEditable(existing.status);
  assertScheduleRange(input.nextRunDate, input.endDate ?? null);

  const managerialCostKind =
    input.managerialCostKind !== undefined
      ? resolveManagerialCostKind(existing.draftKind, input.managerialCostKind)
      : existing.managerialCostKind;
  const autoFinalizeExpense =
    existing.draftKind === 'expense'
      ? input.autoFinalizeExpense !== undefined
        ? Boolean(input.autoFinalizeExpense)
        : existing.autoFinalizeExpense
      : false;

  let payload = parseStoredPayload(existing.draftKind, stripFinalizeFlag(input.payload));
  payload = shapeExpensePayloadForManagerial(payload, managerialCostKind);
  if (existing.draftKind === 'expense' && payload.kind === 'expense' && !hasExplicitRecurringCategory(payload.data)) {
    throw new ValidationError(
      [{ path: 'costCategoryId', message: 'Cost category is required' }],
      'Cost category is required',
    );
  }

  const previousPayload = parseStoredPayload(existing.draftKind, existing.payloadJson);
  const previousAmount = extractTemplateAmount(previousPayload);
  const nextAmount = extractTemplateAmount(payload);

  const updated = await updateRecurringDraftById(context.db, context.organizationId, existing.id, {
    title: input.title,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    nextRunDate: businessDate(input.nextRunDate),
    endDate: input.endDate ? businessDate(input.endDate) : null,
    payloadJson: payload.data,
    autoFinalizeExpense,
    managerialCostKind,
  });
  if (!updated) throw new NotFoundError('Recurring draft');

  if (existing.draftKind === 'expense') {
    await rotateAmountVersionIfChanged(context.db, {
      organizationId: context.organizationId,
      draftId: existing.id,
      previousAmount: previousAmount.amount,
      previousCurrency: previousAmount.currency,
      nextAmount: nextAmount.amount,
      nextCurrency: nextAmount.currency,
      effectiveFrom: todayInTimeZone(context.organization.timezone),
    });
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_UPDATED,
    entityType: 'recurring_financial_draft',
    entityId: updated.id,
    before: { title: existing.title, nextRunDate: existing.nextRunDate, status: existing.status },
    after: { title: updated.title, nextRunDate: updated.nextRunDate, status: updated.status },
  });

  return updated;
}

export async function pauseRecurringDraft(
  context: OrgContext,
  draftId: string,
): Promise<RecurringFinancialDraftRecord> {
  const parsed = recurringDraftIdSchema.safeParse({ draftId });
  if (!parsed.success) throw new NotFoundError('Recurring draft');

  const existing = await requireDraft(context, parsed.data.draftId);
  assertCanManageDraftKind(context, existing.draftKind);
  assertDraftPausable(existing.status);

  const updated = await updateRecurringDraftById(context.db, context.organizationId, existing.id, {
    status: 'paused',
  });
  if (!updated) throw new NotFoundError('Recurring draft');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_PAUSED,
    entityType: 'recurring_financial_draft',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function resumeRecurringDraft(
  context: OrgContext,
  draftId: string,
): Promise<RecurringFinancialDraftRecord> {
  const parsed = recurringDraftIdSchema.safeParse({ draftId });
  if (!parsed.success) throw new NotFoundError('Recurring draft');

  const existing = await requireDraft(context, parsed.data.draftId);
  assertCanManageDraftKind(context, existing.draftKind);
  assertDraftResumable(existing.status);

  const updated = await updateRecurringDraftById(context.db, context.organizationId, existing.id, {
    status: 'active',
  });
  if (!updated) throw new NotFoundError('Recurring draft');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_RESUMED,
    entityType: 'recurring_financial_draft',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function endRecurringDraft(
  context: OrgContext,
  draftId: string,
): Promise<RecurringFinancialDraftRecord> {
  const parsed = recurringDraftIdSchema.safeParse({ draftId });
  if (!parsed.success) throw new NotFoundError('Recurring draft');

  const existing = await requireDraft(context, parsed.data.draftId);
  assertCanManageDraftKind(context, existing.draftKind);
  assertDraftEndable(existing.status);

  const updated = await updateRecurringDraftById(context.db, context.organizationId, existing.id, {
    status: 'ended',
  });
  if (!updated) throw new NotFoundError('Recurring draft');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RECURRING_FINANCIAL_DRAFT_ENDED,
    entityType: 'recurring_financial_draft',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  return updated;
}

export { assertCanReadDraftKind };
