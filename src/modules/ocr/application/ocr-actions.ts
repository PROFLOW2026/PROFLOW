'use server';

import { getTranslations } from 'next-intl/server';
import { createExpense } from '@/modules/expenses';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError, DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createOcrBatch, getOcrBatchProgress } from './batches';
import { cancelOcrJob } from './cancel-job';
import { confirmOcrCandidate } from './confirm-candidate';
import { createVendorBillDraftFromOcr } from './create-vendor-bill-draft';
import { extractReceiptJob } from './extract-receipt';
import { kickDurableOcrQueue } from './kick-queue';
import { listOcrCandidates, OCR_REVIEW_SURFACE_STATUSES } from './list-candidates';
import { loadOcrReviewSuggestions, type OcrReviewSuggestions } from './load-review-suggestions';
import { getOcrProviderStatus } from './provider-status';
import { rejectOcrCandidate } from './reject-candidate';
import { getOcrRepository } from '../data/resolve-repository';
import {
  getOcrFeatureMode,
  isOcrFixtureAllowed,
  isOcrIngestionEnabled,
  isOcrReviewUiAllowed,
} from '../domain/feature-gate';
import { buildFixtureCandidates } from '../domain/field-mapping';
import type { ExtractionJob, OcrBatch, OcrProviderStatus } from '../domain/types';
import {
  cancelOcrJobSchema,
  confirmOcrCandidateSchema,
  createOcrBatchSchema,
  extractReceiptSchema,
  ocrReviewSuggestionsProbeSchema,
  rejectOcrCandidateSchema,
  type CancelOcrJobInput,
  type ConfirmOcrCandidateInput,
  type CreateOcrBatchAppInput,
  type ExtractReceiptAppInput,
  type OcrReviewSuggestionsProbeInput,
  type RejectOcrCandidateInput,
} from '../validation/schemas';

export type OcrActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

async function failMessage(error: unknown): Promise<string> {
  const t = await getTranslations('errors');
  if (error instanceof AuthorizationError) {
    return t('notAllowed');
  }
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return t('unexpected');
}

function assertReviewSurfaceAllowed(): void {
  if (!isOcrReviewUiAllowed()) {
    throw new DomainRuleError(
      'OCR review is disabled',
      'ocr.errors.featureDisabled',
    );
  }
}

export async function getOcrReviewPageDataAction(): Promise<
  OcrActionResult<{
    status: OcrProviderStatus;
    jobs: ExtractionJob[];
    batches: OcrBatch[];
    vendors: readonly { id: string; name: string }[];
  }>
> {
  try {
    const data = await withOrgContext(async (context) => {
      assertReviewSurfaceAllowed();
      const status = getOcrProviderStatus(context);
      const jobs = await listOcrCandidates(context, {
        status: [...OCR_REVIEW_SURFACE_STATUSES],
      });
      const repo = getOcrRepository(context.db);
      const batches = await repo.listBatchesForOrg(context.organizationId);
      let vendors: { id: string; name: string }[] = [];
      try {
        vendors = (await listVendorsForOrg(context, { status: 'active' })).map((vendor) => ({
          id: vendor.id,
          name: vendor.name,
        }));
      } catch {
        vendors = [];
      }
      return { status, jobs, batches, vendors };
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function getOcrReviewSuggestionsAction(
  raw: OcrReviewSuggestionsProbeInput,
): Promise<OcrActionResult<OcrReviewSuggestions>> {
  const parsed = ocrReviewSuggestionsProbeSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    assertReviewSurfaceAllowed();
    const data = await withOrgContext((context) => {
      assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
      return loadOcrReviewSuggestions(context, parsed.data);
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function extractReceiptAction(
  raw: ExtractReceiptAppInput,
): Promise<OcrActionResult<ExtractionJob>> {
  const parsed = extractReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    if (!isOcrIngestionEnabled()) {
      throw new DomainRuleError(
        'OCR ingestion is disabled',
        'ocr.errors.featureDisabled',
      );
    }
    const job = await withOrgContext((context) => extractReceiptJob(context, parsed.data));
    kickDurableOcrQueue();
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function createOcrBatchAction(
  raw: CreateOcrBatchAppInput,
): Promise<OcrActionResult<{ batch: OcrBatch; jobs: ExtractionJob[] }>> {
  const parsed = createOcrBatchSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    if (!isOcrIngestionEnabled()) {
      throw new DomainRuleError(
        'OCR ingestion is disabled',
        'ocr.errors.featureDisabled',
      );
    }
    const data = await withOrgContext((context) => createOcrBatch(context, parsed.data));
    kickDurableOcrQueue();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function cancelOcrJobAction(
  raw: CancelOcrJobInput,
): Promise<OcrActionResult<ExtractionJob>> {
  const parsed = cancelOcrJobSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    assertReviewSurfaceAllowed();
    const job = await withOrgContext((context) => cancelOcrJob(context, parsed.data));
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function getOcrBatchProgressAction(
  batchId: string,
): Promise<OcrActionResult<{ batch: OcrBatch; jobs: ExtractionJob[] }>> {
  try {
    assertReviewSurfaceAllowed();
    const data = await withOrgContext((context) => getOcrBatchProgress(context, batchId));
    if (!data) {
      const t = await getTranslations('errors');
      return { ok: false, error: t('notFound') };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function confirmOcrCandidateAction(
  raw: ConfirmOcrCandidateInput,
): Promise<
  OcrActionResult<{
    kind: 'mapped' | 'created';
    draftTarget: 'expense' | 'vendor_bill' | 'vendor_credit';
    expenseId?: string;
    vendorBillId?: string;
    vendorCreditId?: string;
    expenseInput: unknown;
    job: ExtractionJob;
  }>
> {
  const parsed = confirmOcrCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    assertReviewSurfaceAllowed();
    const result = await withOrgContext((context) =>
      confirmOcrCandidate(context, parsed.data, {
        createExpense,
        createVendorBillDraft: createVendorBillDraftFromOcr,
      }),
    );
    if (result.kind === 'mapped') {
      return {
        ok: true,
        data: {
          kind: 'mapped',
          draftTarget: result.draftTarget,
          expenseInput: result.expenseInput,
          job: result.job,
        },
      };
    }
    if (result.draftTarget === 'vendor_bill') {
      return {
        ok: true,
        data: {
          kind: 'created',
          draftTarget: 'vendor_bill',
          vendorBillId: result.vendorBillId,
          expenseInput: null,
          job: result.job,
        },
      };
    }
    if (result.draftTarget === 'vendor_credit') {
      return {
        ok: true,
        data: {
          kind: 'created',
          draftTarget: 'vendor_credit',
          vendorCreditId: result.vendorCreditId,
          expenseInput: null,
          job: result.job,
        },
      };
    }
    return {
      ok: true,
      data: {
        kind: 'created',
        draftTarget: 'expense',
        expenseId: result.expenseId,
        expenseInput: result.expenseInput,
        job: result.job,
      },
    };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function rejectOcrCandidateAction(
  raw: RejectOcrCandidateInput,
): Promise<OcrActionResult<ExtractionJob>> {
  const parsed = rejectOcrCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    const t = await getTranslations('errors');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validationFailed') };
  }
  try {
    assertReviewSurfaceAllowed();
    const job = await withOrgContext((context) => rejectOcrCandidate(context, parsed.data));
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

/**
 * Seeds a sample review job for local tooling/tests. Not OCR provider output.
 * Requires documents.manage + OCR_ALLOW_FIXTURE (never production).
 */
export async function seedFixtureOcrJobAction(): Promise<OcrActionResult<ExtractionJob>> {
  try {
    if (!isOcrFixtureAllowed() || getOcrFeatureMode() === 'disabled') {
      throw new DomainRuleError(
        'Sample review seeding is disabled',
        'ocr.errors.featureDisabled',
      );
    }
    const job = await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
      const repo = getOcrRepository(context.db);
      return repo.seedFixtureJob({
        organizationId: context.organizationId,
        candidates: buildFixtureCandidates(),
      });
    });
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}
