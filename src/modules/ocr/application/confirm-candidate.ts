import { createExpense } from '@/modules/expenses';
import type { CreateExpenseInput } from '@/modules/expenses';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  confirmReceiptExtraction,
  mapConfirmedFieldsToExpenseDraft,
  type ConfirmedReceiptFields,
} from '../domain/confirm';
import {
  applyFieldOverrides,
  assertCandidatesPresent,
  emptyCandidates,
  mapCandidatesToExpenseInput,
  type CandidateFieldOverrides,
} from '../domain/field-mapping';
import type {
  ExtractionJob,
  OcrFieldCandidate,
  OcrReviewOverrides,
  ReceiptExtractionCandidates,
} from '../domain/types';
import { findJob, updateJob } from '../data/in-memory-ocr.store';
import type { ConfirmOcrCandidateInput } from '../validation/schemas';
import { confirmOcrCandidateSchema } from '../validation/schemas';

export type CreateExpenseFn = (
  context: OrgContext,
  input: CreateExpenseInput,
) => Promise<{ id: string }>;

export type ConfirmOcrCandidateResult =
  | {
      readonly kind: 'mapped';
      readonly job: ExtractionJob;
      /** Present when accepted fields already form a valid draft expense payload. */
      readonly expenseInput: CreateExpenseInput | null;
      readonly draft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
    }
  | {
      readonly kind: 'created';
      readonly job: ExtractionJob;
      readonly expenseId: string;
      readonly expenseInput: CreateExpenseInput;
      readonly draft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
    };

function candidatesFromConfirmed(fields: ConfirmedReceiptFields): ReceiptExtractionCandidates {
  const mk = (value: string | null): OcrFieldCandidate => ({
    value,
    confidence: null,
    provenance: { source: 'user_override' },
  });
  const blank = emptyCandidates({ source: 'user_override' });
  return {
    ...blank,
    vendor: mk(fields.vendor),
    date: mk(fields.date),
    dueDate: mk(fields.dueDate),
    reference: mk(fields.reference),
    description: mk(fields.description),
    net: mk(fields.net),
    tax: mk(fields.tax),
    gross: mk(fields.gross),
    currency: mk(fields.currency),
    // Suggestions never become confirmed ledger inputs.
    lineDescriptions: [],
    suggestions: { projectLabel: null, categoryLabel: null },
  };
}

function mergeReviewOverrides(
  existing: OcrReviewOverrides | null,
  incoming: CandidateFieldOverrides | undefined,
): OcrReviewOverrides | null {
  if (!incoming || Object.keys(incoming).length === 0) return existing;
  return { ...(existing ?? {}), ...incoming };
}

/**
 * Review workflow: map OCR candidates → expense draft payload.
 *
 * Expense creation happens ONLY when `confirm: true`. With `confirm: false`,
 * retains user corrections on the job and returns the mapped payload — no ledger write.
 *
 * createExpense always inserts status `draft` — never finalized from OCR.
 */
export async function confirmOcrCandidate(
  context: OrgContext,
  rawInput: ConfirmOcrCandidateInput,
  deps: { createExpense?: CreateExpenseFn } = {},
): Promise<ConfirmOcrCandidateResult> {
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);
  const input = confirmOcrCandidateSchema.parse(rawInput);

  const job = findJob(context.organizationId, input.jobId);
  if (!job) throw new NotFoundError('OCR extraction job');

  if (job.status !== 'needs_review' && job.status !== 'succeeded') {
    throw new DomainRuleError(
      `Job status ${job.status} cannot be confirmed`,
      'ocr.errors.jobNotReviewable',
    );
  }

  if (job.confirmedExpenseId) {
    throw new DomainRuleError(
      'Extraction was already confirmed into an expense',
      'ocr.errors.alreadyConfirmed',
    );
  }

  assertCandidatesPresent(job.candidates);

  const overrides = input.fieldOverrides as CandidateFieldOverrides | undefined;
  const workingCandidates = applyFieldOverrides(job.candidates, overrides);
  const retainedOverrides = mergeReviewOverrides(job.reviewOverrides, overrides);

  // Retain corrections + working candidates; never overwrite extracted snapshot.
  const retained = updateJob(context.organizationId, job.id, {
    candidates: workingCandidates,
    reviewOverrides: retainedOverrides,
    extractedCandidates: job.extractedCandidates ?? job.candidates,
  });
  if (!retained) throw new NotFoundError('OCR extraction job');

  const confirmed = confirmReceiptExtraction({
    candidates: workingCandidates,
    overrides,
    acceptedFields: input.acceptedFields,
  });

  const draft = mapConfirmedFieldsToExpenseDraft(confirmed);
  // Draft mapping is always available; CreateExpenseInput validation runs when
  // confirming, and optionally on preview when fields are complete enough.
  let expenseInput: CreateExpenseInput | null = null;
  try {
    expenseInput = mapCandidatesToExpenseInput(candidatesFromConfirmed(confirmed)).input;
  } catch (error) {
    if (input.confirm) throw error;
  }

  // Explicit: OCR confirm never invents project/category targeting.
  if (
    expenseInput &&
    (expenseInput.projectId != null || expenseInput.costCategoryId != null)
  ) {
    throw new DomainRuleError(
      'OCR confirm must not set project or category IDs',
      'ocr.errors.nonCanonicalSuggestion',
    );
  }

  if (!input.confirm) {
    return { kind: 'mapped', job: retained, expenseInput, draft };
  }

  if (!expenseInput) {
    throw new DomainRuleError(
      'Accepted OCR fields are incomplete for an expense draft',
      'ocr.errors.incompleteExpenseMapping',
    );
  }

  const create = deps.createExpense ?? createExpense;
  // createExpense always inserts status `draft` — never finalized from OCR.
  const created = await create(context, expenseInput);

  const updated = updateJob(context.organizationId, job.id, {
    status: 'succeeded',
    confirmedExpenseId: created.id,
    candidates: workingCandidates,
    reviewOverrides: retainedOverrides,
    extractedCandidates: retained.extractedCandidates,
  });

  return {
    kind: 'created',
    job: updated!,
    expenseId: created.id,
    expenseInput,
    draft,
  };
}
