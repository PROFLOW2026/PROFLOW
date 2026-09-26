'use server';

import { getTranslations } from 'next-intl/server';
import { isStorageConfigured } from '@/modules/documents';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  DomainRuleError,
  translateMessageKey,
} from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CaptureSource, SessionFileInput } from '../domain/types';
import { approveCapture } from './approve-capture';
import { finalizeCaptureUpload } from './finalize-capture-upload';
import { listCaptureInbox, type CaptureInboxItem } from './list-inbox';
import { loadCaptureReview, type CaptureReviewData } from './load-capture-review';
import { pollCaptureOcr } from './poll-capture-ocr';
import { rejectCapture } from './reject-capture';
import { markCaptureUploadFailed, submitCapture } from './submit-capture';
import { startFinancialOcr } from './start-financial-ocr';
import type { ApproveFieldMediaInput, ApproveFinancialInput, ApproveOtherDocumentInput } from './approve-capture';

export type QuickCaptureActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly messageKey?: string };

async function failMessage(error: unknown): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tQuickCapture = await getTranslations('quickCapture');
  if (error instanceof AuthorizationError) return tErrors('notAllowed');
  if (error instanceof DomainRuleError) {
    const key = error.messageKey;
    if (key?.startsWith('quickCapture.')) {
      try {
        const subKey = key.replace(/^quickCapture\./, '') as 'errors.emptySession';
        return tQuickCapture(subKey);
      } catch {
        return error.message;
      }
    }
    if (key) {
      const translated = translateMessageKey(key, {
        tErrors: (k) => tErrors(k as 'unexpected'),
      });
      if (translated) return translated;
    }
    return error.message;
  }
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return tErrors('unexpected');
}

function domainMessageKey(error: unknown): string | undefined {
  if (error instanceof DomainRuleError) return error.messageKey;
  if (error instanceof AppError) return error.messageKey;
  return undefined;
}

export async function getQuickCaptureFormDataAction(): Promise<
  QuickCaptureActionResult<{
    projects: readonly { id: string; name: string }[];
    canManageDocuments: boolean;
    storageConfigured: boolean;
    organizationId: string;
  }>
> {
  try {
    const data = await withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
        throw new AuthorizationError();
      }
      const projects = await listProjectsForOrg(context, { status: 'active' }).catch(() => []);
      return {
        projects: projects.map((project) => ({ id: project.id, name: project.name })),
        canManageDocuments: true,
        storageConfigured: await isStorageConfigured(context),
        organizationId: context.organizationId,
      };
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function submitQuickCaptureAction(input: {
  readonly files: readonly SessionFileInput[];
  readonly ownerNote?: string;
  readonly explicitProjectId?: string;
  readonly source?: CaptureSource;
  readonly idempotencyKey?: string;
}): Promise<
  QuickCaptureActionResult<{
    captureId: string;
    uploads: Awaited<ReturnType<typeof submitCapture>>['documents'];
  }>
> {
  try {
    const data = await withOrgContext(async (context) => {
      const result = await submitCapture(context, {
        files: input.files,
        ownerNote: input.ownerNote ?? null,
        explicitProjectId: input.explicitProjectId ?? null,
        source: input.source ?? 'quick_capture',
        idempotencyKey: input.idempotencyKey ?? null,
      });
      return {
        captureId: result.capture.id,
        uploads: result.documents,
      };
    });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: await failMessage(error),
      messageKey: domainMessageKey(error),
    };
  }
}

export async function finalizeQuickCaptureUploadAction(input: {
  readonly captureId: string;
  readonly documents: readonly { documentId: string; sizeBytes: number; checksum?: string }[];
}): Promise<QuickCaptureActionResult<{ captureId: string }>> {
  try {
    const data = await withOrgContext(async (context) => {
      const capture = await finalizeCaptureUpload(context, {
        captureId: input.captureId,
        documents: input.documents,
      });
      return { captureId: capture.id };
    });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: await failMessage(error),
      messageKey: domainMessageKey(error),
    };
  }
}

export async function markQuickCaptureUploadFailedAction(input: {
  readonly captureId: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}): Promise<QuickCaptureActionResult<{ captureId: string }>> {
  try {
    const data = await withOrgContext(async (context) => {
      await markCaptureUploadFailed(context, input.captureId, {
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      });
      return { captureId: input.captureId };
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function listQuickCaptureInboxAction(): Promise<
  QuickCaptureActionResult<readonly CaptureInboxItem[]>
> {
  try {
    const data = await withOrgContext(async (context) => listCaptureInbox(context));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function getQuickCaptureReviewAction(
  captureId: string,
): Promise<QuickCaptureActionResult<CaptureReviewData>> {
  try {
    const data = await withOrgContext(async (context) => loadCaptureReview(context, captureId));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function startCaptureFinancialOcrAction(input: {
  readonly captureId: string;
  readonly documentId: string;
  readonly forceRetry?: boolean;
}): Promise<QuickCaptureActionResult<{ jobId: string }>> {
  try {
    const data = await withOrgContext(async (context) => {
      const job = await startFinancialOcr(context, input);
      return { jobId: job.id };
    });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: await failMessage(error),
      messageKey: domainMessageKey(error),
    };
  }
}

export async function pollCaptureOcrAction(
  captureId: string,
): Promise<QuickCaptureActionResult<Awaited<ReturnType<typeof pollCaptureOcr>>>> {
  try {
    const data = await withOrgContext(async (context) => pollCaptureOcr(context, captureId));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}

export async function approveQuickCaptureAction(input: {
  readonly captureId: string;
  readonly ownerSelectedType: 'financial_document' | 'field_media' | 'other_document';
} & Partial<ApproveFieldMediaInput & ApproveFinancialInput & ApproveOtherDocumentInput>): Promise<
  QuickCaptureActionResult<{ captureId: string }>
> {
  try {
    const data = await withOrgContext(async (context) => {
      const approved = await approveCapture(context, input);
      return { captureId: approved.id };
    });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: await failMessage(error),
      messageKey: domainMessageKey(error),
    };
  }
}

export async function rejectQuickCaptureAction(input: {
  readonly captureId: string;
  readonly mode: 'reject' | 'archive';
  readonly reason?: string;
}): Promise<QuickCaptureActionResult<{ captureId: string }>> {
  try {
    const data = await withOrgContext(async (context) => {
      const rejected = await rejectCapture(context, input);
      return { captureId: rejected.id };
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: await failMessage(error) };
  }
}
