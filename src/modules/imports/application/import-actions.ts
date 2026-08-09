'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError } from '@/shared/errors';
import { confirmImportInBatches } from './confirm-import';
import { previewImport } from './preview-import';
import type { ColumnMapping } from '../domain/types';
import type { ImportConfirmResult, ImportPreview } from '../domain/types';

export type PreviewImportActionResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export type ConfirmImportActionResult =
  | { ok: true; result: ImportConfirmResult }
  | { ok: false; error: string };

function mapError(error: unknown, fallback: string): string {
  if (error instanceof ValidationError) {
    return error.issues.map((i) => i.message).join('; ') || error.message;
  }
  if (error instanceof AppError) return error.message;
  return fallback;
}

export async function previewImportAction(input: {
  kind: string;
  csvText: string;
  mapping?: ColumnMapping;
}): Promise<PreviewImportActionResult> {
  const t = await getTranslations('imports');
  try {
    const preview = await withOrgContext((context) =>
      Promise.resolve(
        previewImport(context, {
          kind: input.kind,
          csvText: input.csvText,
          mapping: input.mapping,
        }),
      ),
    );
    return { ok: true, preview };
  } catch (error) {
    return { ok: false, error: mapError(error, t('errors.previewFailed')) };
  }
}

export async function confirmImportAction(input: {
  kind: string;
  csvText: string;
  mapping: ColumnMapping;
  rowNumbers?: number[];
}): Promise<ConfirmImportActionResult> {
  const t = await getTranslations('imports');
  try {
    const result = await confirmImportInBatches(withOrgContext, {
      kind: input.kind,
      csvText: input.csvText,
      mapping: input.mapping,
      rowNumbers: input.rowNumbers,
    });

    revalidatePath('/clients');
    revalidatePath('/vendors');
    revalidatePath('/workforce/employees');
    revalidatePath('/projects');
    revalidatePath('/imports');

    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: mapError(error, t('errors.confirmFailed')) };
  }
}
