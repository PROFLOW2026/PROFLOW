'use server';

import { getTranslations } from 'next-intl/server';
import { createExpense } from '@/modules/expenses';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { confirmOcrCandidate } from './confirm-candidate';
import { extractReceiptJob } from './extract-receipt';
import { listOcrCandidates } from './list-candidates';
import { getOcrProviderStatus } from './provider-status';
import { seedFixtureJob } from '../data/in-memory-ocr.store';
import { buildFixtureCandidates } from '../domain/field-mapping';
import type { ExtractionJob, OcrProviderStatus } from '../domain/types';
import {
  confirmOcrCandidateSchema,
  extractReceiptSchema,
  type ConfirmOcrCandidateInput,
  type ExtractReceiptAppInput,
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

export async function getOcrReviewPageDataAction(): Promise<
  OcrActionResult<{ status: OcrProviderStatus; jobs: ExtractionJob[] }>
> {
  try {
    const data = await withOrgContext(async (context) => {
      const status = getOcrProviderStatus(context);
      const jobs = listOcrCandidates(context, { status: ['needs_review', 'failed'] });
      return { status, jobs };
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
    const job = await withOrgContext((context) => extractReceiptJob(context, parsed.data));
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function confirmOcrCandidateAction(
  raw: ConfirmOcrCandidateInput,
): Promise<
  OcrActionResult<{
    kind: 'mapped' | 'created';
    expenseId?: string;
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
    const result = await withOrgContext((context) =>
      confirmOcrCandidate(context, parsed.data, { createExpense }),
    );
    if (result.kind === 'mapped') {
      return {
        ok: true,
        data: {
          kind: 'mapped',
          expenseInput: result.expenseInput,
          job: result.job,
        },
      };
    }
    return {
      ok: true,
      data: {
        kind: 'created',
        expenseId: result.expenseId,
        expenseInput: result.expenseInput,
        job: result.job,
      },
    };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

/**
 * Seeds a fixture review job for demos/tests. Not OCR provider output.
 * Requires documents.manage.
 */
export async function seedFixtureOcrJobAction(): Promise<OcrActionResult<ExtractionJob>> {
  try {
    const job = await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
      return seedFixtureJob({
        organizationId: context.organizationId,
        candidates: buildFixtureCandidates(),
      });
    });
    return { ok: true, data: job };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}
