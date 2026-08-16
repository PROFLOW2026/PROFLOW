import { createExpense } from '@/modules/expenses';
import type { CreateExpenseInput } from '@/modules/expenses';
import { findExpenseById } from '@/modules/expenses';
import { findApBillById } from '@/modules/ap';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { linkDocumentToEntity } from '@/modules/documents';
import {
  confirmReceiptExtraction,
  mapConfirmedFieldsToExpenseDraft,
  mapConfirmedFieldsToVendorBillDraft,
  mapStructuredBillLines,
  type ConfirmedReceiptFields,
} from '../domain/confirm';
import { lineItemsTrustworthy } from '../domain/totals-warnings';
import {
  applyFieldOverrides,
  assertCandidatesPresent,
  emptyCandidates,
  mapCandidatesToExpenseInput,
  type CandidateFieldOverrides,
} from '../domain/field-mapping';
import {
  assertOcrConfirmedTargetShape,
  expenseConfirmTargetShape,
  vendorBillConfirmTargetShape,
  vendorCreditConfirmTargetShape,
} from '../domain/target-shape';
import type {
  ExtractionJob,
  OcrDraftTarget,
  OcrFieldCandidate,
  OcrReviewOverrides,
  ReceiptExtractionCandidates,
} from '../domain/types';
import type { OcrRepository } from '../data/ocr.repository';
import { getOcrRepository } from '../data/resolve-repository';
import type { ConfirmOcrCandidateInput } from '../validation/schemas';
import { confirmOcrCandidateSchema } from '../validation/schemas';
import {
  createVendorBillDraftFromOcr,
  type CreateVendorBillDraftFn,
  type VendorBillDraftPayload,
} from './create-vendor-bill-draft';
import {
  createVendorCreditDraftFromOcr,
  mapFieldsToVendorCreditDraft,
  type CreateVendorCreditDraftFn,
} from './create-vendor-credit-draft';
import { rememberOcrCorrections } from './remember-corrections';

export type CreateExpenseFn = (
  context: OrgContext,
  input: CreateExpenseInput,
) => Promise<{ id: string }>;

export type ConfirmOcrCandidateResult =
  | {
      readonly kind: 'mapped';
      readonly job: ExtractionJob;
      readonly draftTarget: OcrDraftTarget;
      /** Present when accepted fields already form a valid draft expense payload. */
      readonly expenseInput: CreateExpenseInput | null;
      readonly expenseDraft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
      readonly vendorBillDraft: VendorBillDraftPayload | null;
      /** @deprecated Prefer expenseDraft - kept for existing callers. */
      readonly draft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
    }
  | {
      readonly kind: 'created';
      readonly draftTarget: 'expense';
      readonly job: ExtractionJob;
      readonly expenseId: string;
      readonly expenseInput: CreateExpenseInput;
      readonly expenseDraft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
      readonly draft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
    }
  | {
      readonly kind: 'created';
      readonly draftTarget: 'vendor_bill';
      readonly job: ExtractionJob;
      readonly vendorBillId: string;
      readonly vendorBillDraft: VendorBillDraftPayload;
      readonly expenseDraft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
      readonly draft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
    }
  | {
      readonly kind: 'created';
      readonly draftTarget: 'vendor_credit';
      readonly job: ExtractionJob;
      readonly vendorCreditId: string;
      readonly expenseDraft: ReturnType<typeof mapConfirmedFieldsToExpenseDraft>;
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
    companyNumber: mk(fields.companyNumber),
    vatId: mk(fields.vatId),
    date: mk(fields.date),
    dueDate: mk(fields.dueDate),
    reference: mk(fields.reference),
    orderNumber: mk(fields.orderNumber),
    documentType: mk(fields.documentType),
    description: mk(fields.description),
    net: mk(fields.net),
    tax: mk(fields.tax),
    gross: mk(fields.gross),
    currency: mk(fields.currency),
    lineDescriptions: [],
    lines: [],
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

function assertDraftPermission(context: OrgContext, draftTarget: OcrDraftTarget): void {
  if (draftTarget === 'vendor_bill' || draftTarget === 'vendor_credit') {
    assertPermission(context, PERMISSIONS.AP_MANAGE);
    return;
  }
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);
}

async function assertExpenseSameOrg(
  context: OrgContext,
  expenseId: string,
): Promise<void> {
  // Skip when unit tests inject a stub db without repository methods.
  if (!context.db || typeof (context.db as { select?: unknown }).select !== 'function') {
    return;
  }
  const expense = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!expense) {
    throw new NotFoundError('Expense');
  }
}

async function assertVendorBillSameOrg(
  context: OrgContext,
  billId: string,
): Promise<void> {
  if (!context.db || typeof (context.db as { select?: unknown }).select !== 'function') {
    return;
  }
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill) {
    throw new NotFoundError('Vendor bill');
  }
}

/**
 * Review workflow: map OCR candidates → draft Expense or draft Vendor Bill.
 *
 * Draft creation happens ONLY when `confirm: true`. With `confirm: false`,
 * retains user corrections on the job and returns the mapped payload - no write.
 *
 * NEVER finalizes expenses or posts open/recognized vendor bills.
 */
export async function confirmOcrCandidate(
  context: OrgContext,
  rawInput: ConfirmOcrCandidateInput,
  deps: {
    createExpense?: CreateExpenseFn;
    createVendorBillDraft?: CreateVendorBillDraftFn;
    createVendorCreditDraft?: CreateVendorCreditDraftFn;
    repo?: OcrRepository;
  } = {},
): Promise<ConfirmOcrCandidateResult> {
  const input = confirmOcrCandidateSchema.parse(rawInput);
  const draftTarget: OcrDraftTarget = input.draftTarget ?? 'expense';
  assertDraftPermission(context, draftTarget);
  const repo = deps.repo ?? getOcrRepository(context.db);

  const job = await repo.findJob(context.organizationId, input.jobId);
  if (!job) throw new NotFoundError('OCR extraction job');

  if (job.confirmedExpenseId || job.confirmedVendorBillId || job.confirmedVendorCreditId) {
    throw new DomainRuleError(
      'Extraction was already confirmed into a draft',
      'ocr.errors.alreadyConfirmed',
    );
  }

  if (job.status !== 'needs_review' && job.status !== 'succeeded') {
    throw new DomainRuleError(
      `Job status ${job.status} cannot be confirmed`,
      'ocr.errors.jobNotReviewable',
    );
  }

  assertCandidatesPresent(job.candidates);

  const overrides = input.fieldOverrides as CandidateFieldOverrides | undefined;
  const workingCandidates = applyFieldOverrides(job.candidates, overrides);
  const retainedOverrides = mergeReviewOverrides(job.reviewOverrides, overrides);

  const retained = await repo.updateJob(context.organizationId, job.id, {
    candidates: workingCandidates,
    reviewOverrides: retainedOverrides,
    extractedCandidates: job.extractedCandidates ?? job.candidates,
    acceptedFields: input.acceptedFields,
    rejectedFields: input.rejectedFields ?? null,
  });
  if (!retained) throw new NotFoundError('OCR extraction job');

  const confirmed = confirmReceiptExtraction({
    candidates: workingCandidates,
    overrides,
    acceptedFields: input.acceptedFields,
  });

  const expenseDraft = mapConfirmedFieldsToExpenseDraft(confirmed);

  let expenseInput: CreateExpenseInput | null = null;
  if (draftTarget === 'expense') {
    try {
      expenseInput = mapCandidatesToExpenseInput(candidatesFromConfirmed(confirmed)).input;
    } catch (error) {
      if (input.confirm) throw error;
    }

    if (
      expenseInput &&
      (expenseInput.projectId != null || expenseInput.costCategoryId != null)
    ) {
      throw new DomainRuleError(
        'OCR confirm must not set project or category IDs',
        'ocr.errors.nonCanonicalSuggestion',
      );
    }
  }

  if (!input.confirm) {
    return {
      kind: 'mapped',
      job: retained,
      draftTarget,
      expenseInput,
      expenseDraft,
      vendorBillDraft:
        input.vendorId != null
          ? mapConfirmedFieldsToVendorBillDraft(confirmed, input.vendorId)
          : null,
      draft: expenseDraft,
    };
  }

  const inFlight =
    job.status === 'needs_review'
      ? await repo.claimJob(context.organizationId, job.id, ['needs_review'], {
          status: 'succeeded',
          reviewStatus: 'accepted',
          candidates: workingCandidates,
          reviewOverrides: retainedOverrides,
          extractedCandidates: retained.extractedCandidates,
          acceptedFields: input.acceptedFields,
          rejectedFields: input.rejectedFields ?? null,
        })
      : retained;
  if (!inFlight) {
    const latest = await repo.findJob(context.organizationId, job.id);
    if (
      latest?.confirmedExpenseId ||
      latest?.confirmedVendorBillId ||
      latest?.confirmedVendorCreditId
    ) {
      throw new DomainRuleError(
        'Extraction was already confirmed into a draft',
        'ocr.errors.alreadyConfirmed',
      );
    }
    throw new ConflictError('OCR job was updated concurrently');
  }

  if (draftTarget === 'vendor_bill') {
    if (!input.vendorId) {
      throw new DomainRuleError(
        'Vendor is required to create a draft vendor bill',
        'ocr.errors.vendorRequired',
      );
    }
    const currency = confirmed.currency?.trim().toUpperCase() || '';
    const structured = lineItemsTrustworthy(workingCandidates)
      ? mapStructuredBillLines(workingCandidates, currency)
      : [];
    const billDraft = mapConfirmedFieldsToVendorBillDraft(
      confirmed,
      input.vendorId,
      structured.length > 0 ? structured : undefined,
    );
    if (!billDraft.totalAmount || !billDraft.currency || billDraft.lines.length === 0) {
      throw new DomainRuleError(
        'Accepted OCR fields are incomplete for a vendor bill draft',
        'ocr.errors.incompleteVendorBillMapping',
      );
    }
    if (billDraft.status !== 'draft' || billDraft.recognizedVendorActual !== false) {
      throw new DomainRuleError(
        'OCR may only create draft vendor bills',
        'ocr.errors.vendorBillMustBeDraft',
      );
    }

    const createBill = deps.createVendorBillDraft ?? createVendorBillDraftFromOcr;
    const created = await createBill(context, billDraft);
    if (created.status !== 'draft') {
      throw new DomainRuleError(
        'Vendor bill creator must return draft status',
        'ocr.errors.vendorBillMustBeDraft',
      );
    }

    await assertVendorBillSameOrg(context, created.id);
    await linkSourceDocument(context, job.sourceDocument.documentId, 'ap_bill', created.id);
    const targetShape = vendorBillConfirmTargetShape(created.id);
    assertOcrConfirmedTargetShape(targetShape);

    const updated = await claimConfirmedTarget(repo, context.organizationId, job.id, {
      ...targetShape,
      candidates: workingCandidates,
      reviewOverrides: retainedOverrides,
      extractedCandidates: retained.extractedCandidates,
      acceptedFields: input.acceptedFields,
      rejectedFields: input.rejectedFields ?? null,
    });

    await rememberOcrCorrections(context, {
      vendorName: confirmed.vendor,
      companyNumber: confirmed.companyNumber,
      vatId: confirmed.vatId,
      currency: confirmed.currency,
      vendorId: input.vendorId,
      projectId: input.rememberProjectId,
      purchaseOrderId: input.rememberPurchaseOrderId,
      subcontractAgreementId: input.rememberSubcontractAgreementId,
    });

    return {
      kind: 'created',
      draftTarget: 'vendor_bill',
      job: updated!,
      vendorBillId: created.id,
      vendorBillDraft: billDraft,
      expenseDraft,
      draft: expenseDraft,
    };
  }

  if (draftTarget === 'vendor_credit') {
    if (!input.vendorId) {
      throw new DomainRuleError(
        'Vendor is required to create a draft vendor credit',
        'ocr.errors.vendorRequired',
      );
    }
    const creditDraft = mapFieldsToVendorCreditDraft({
      vendorId: input.vendorId,
      reference: confirmed.reference,
      date: confirmed.date,
      currency: confirmed.currency,
      amount: confirmed.gross ?? confirmed.net,
      netAmount: confirmed.net,
      taxAmount: confirmed.tax,
      description: confirmed.description,
    });
    if (!creditDraft) {
      throw new DomainRuleError(
        'Accepted OCR fields are incomplete for a vendor credit draft',
        'ocr.errors.incompleteVendorCreditMapping',
      );
    }
    const createCredit = deps.createVendorCreditDraft ?? createVendorCreditDraftFromOcr;
    const created = await createCredit(context, creditDraft);
    await linkSourceDocument(context, job.sourceDocument.documentId, 'vendor', input.vendorId);
    const targetShape = vendorCreditConfirmTargetShape(created.id);
    assertOcrConfirmedTargetShape(targetShape);
    const updated = await claimConfirmedTarget(repo, context.organizationId, job.id, {
      ...targetShape,
      candidates: workingCandidates,
      reviewOverrides: retainedOverrides,
      extractedCandidates: retained.extractedCandidates,
      acceptedFields: input.acceptedFields,
      rejectedFields: input.rejectedFields ?? null,
    });
    await rememberOcrCorrections(context, {
      vendorName: confirmed.vendor,
      companyNumber: confirmed.companyNumber,
      vatId: confirmed.vatId,
      currency: confirmed.currency,
      vendorId: input.vendorId,
      projectId: input.rememberProjectId,
      purchaseOrderId: input.rememberPurchaseOrderId,
      subcontractAgreementId: input.rememberSubcontractAgreementId,
    });
    return {
      kind: 'created',
      draftTarget: 'vendor_credit',
      job: updated!,
      vendorCreditId: created.id,
      expenseDraft,
      draft: expenseDraft,
    };
  }

  if (!expenseInput) {
    throw new DomainRuleError(
      'Accepted OCR fields are incomplete for an expense draft',
      'ocr.errors.incompleteExpenseMapping',
    );
  }

  const create = deps.createExpense ?? createExpense;
  // createExpense always inserts status `draft` - never finalized from OCR.
  const created = await create(context, expenseInput);

  await assertExpenseSameOrg(context, created.id);
  await linkSourceDocument(context, job.sourceDocument.documentId, 'expense', created.id);
  const targetShape = expenseConfirmTargetShape(created.id);
  assertOcrConfirmedTargetShape(targetShape);

  const updated = await claimConfirmedTarget(repo, context.organizationId, job.id, {
    ...targetShape,
    candidates: workingCandidates,
    reviewOverrides: retainedOverrides,
    extractedCandidates: retained.extractedCandidates,
    acceptedFields: input.acceptedFields,
    rejectedFields: input.rejectedFields ?? null,
  });

  await rememberOcrCorrections(context, {
    vendorName: confirmed.vendor,
    companyNumber: confirmed.companyNumber,
    vatId: confirmed.vatId,
    currency: confirmed.currency,
    vendorId: input.vendorId,
    projectId: input.rememberProjectId,
    purchaseOrderId: input.rememberPurchaseOrderId,
    subcontractAgreementId: input.rememberSubcontractAgreementId,
  });

  return {
    kind: 'created',
    draftTarget: 'expense',
    job: updated!,
    expenseId: created.id,
    expenseInput,
    expenseDraft,
    draft: expenseDraft,
  };
}

async function claimConfirmedTarget(
  repo: OcrRepository,
  organizationId: string,
  jobId: string,
  patch: Parameters<OcrRepository['claimJob']>[3],
) {
  const updated = await repo.claimJob(organizationId, jobId, ['succeeded'], {
    status: 'succeeded',
    reviewStatus: 'accepted',
    ...patch,
  });
  if (!updated) throw new ConflictError('OCR job was confirmed concurrently');
  return updated;
}

async function linkSourceDocument(
  context: OrgContext,
  documentId: string | null,
  ownerType: 'expense' | 'ap_bill' | 'vendor',
  ownerId: string,
): Promise<void> {
  if (!documentId) return;
  if (!context.db || typeof (context.db as { select?: unknown }).select !== 'function') return;
  try {
    await linkDocumentToEntity(context, { documentId, ownerType, ownerId });
  } catch {
    // Job retains documentId; entity link is best-effort.
  }
}
