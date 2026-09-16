'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ServiceUnavailableError, ValidationError, mapServerActionError } from '@/shared/errors';
import { isReportKind } from '@/modules/reports';
import { listGeneratedArtifacts } from './list-artifacts';
import { resolveGeneratedDocumentBinding } from './resolve-binding';
import { saveGeneratedReportToStorage } from './save-generated-report';
import type { GeneratedArtifactSummary, SaveGeneratedDocumentResult } from '../domain/types';

export interface GeneratedDocumentActionResult {
  readonly error?: string;
  readonly result?: SaveGeneratedDocumentResult;
  readonly artifacts?: readonly GeneratedArtifactSummary[];
}

export async function saveGeneratedReportToStorageAction(input: {
  readonly kind: string;
  readonly entityId: string;
  readonly forceNewVersion?: boolean;
  readonly idempotencyKey?: string;
  readonly reportMonth?: string;
}): Promise<GeneratedDocumentActionResult> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('generatedDocuments');

  if (!isReportKind(input.kind)) {
    return { error: t('errors.unsupportedKind') };
  }

  try {
    const result = await withOrgContext((context) =>
      saveGeneratedReportToStorage(context, {
        kind: input.kind as import('@/modules/reports').ReportKind,
        entityId: input.entityId,
        forceNewVersion: input.forceNewVersion,
        idempotencyKey: input.idempotencyKey,
        reportMonth: input.reportMonth,
      }),
    );
    revalidatePath('/reports/preview');
    return { result };
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return { error: t('errors.storageNotConfigured') };
    }
    if (error instanceof ValidationError || error instanceof AppError) {
      return mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
      });
    }
    throw error;
  }
}

export async function listGeneratedArtifactsAction(input: {
  readonly kind: string;
  readonly entityId: string;
  readonly reportMonth?: string;
}): Promise<GeneratedDocumentActionResult> {
  const t = await getTranslations('generatedDocuments');
  if (!isReportKind(input.kind)) {
    return { error: t('errors.unsupportedKind') };
  }

  try {
    const artifacts = await withOrgContext(async (context) => {
      const kind = input.kind as import('@/modules/reports').ReportKind;
      const binding = await resolveGeneratedDocumentBinding(
        context,
        kind,
        input.entityId,
        input.reportMonth,
      );
      return listGeneratedArtifacts(context, {
        ownerType: binding.ownerType,
        ownerId: binding.ownerId,
        generatedKind: kind,
        sourceEntityId: binding.sourceEntityId,
        reportMonth:
          input.reportMonth ?? (input.kind === 'monthly_workforce_report' ? input.entityId : null),
      });
    });
    return { artifacts };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.message };
    }
    throw error;
  }
}
