'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError } from '@/shared/errors';
import { rowsToCsv } from '@/modules/exports/domain/csv';
import { workbookFirstSheetToMatrix } from '@/modules/exports/domain/xlsx';
import { confirmImportInBatches } from './confirm-import';
import { enrichImportPreview } from './enrich-preview';
import { previewImport } from './preview-import';
import type { ColumnMapping } from '../domain/types';
import type { ImportConfirmResult, ImportPreview } from '../domain/types';

export type PreviewImportActionResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export type ConfirmImportActionResult =
  | { ok: true; result: ImportConfirmResult }
  | { ok: false; error: string };

export type ParseImportFileActionResult =
  | { ok: true; csvText: string }
  | { ok: false; error: string };

function mapError(error: unknown, fallback: string): string {
  if (error instanceof ValidationError) {
    return error.issues.map((i) => i.message).join('; ') || error.message;
  }
  if (error instanceof AppError) return error.message;
  return fallback;
}

/** Bound base64 upload size before decode (~2MB decoded). */
const MAX_IMPORT_UPLOAD_CHARS = 2_800_000;

/**
 * Convert an uploaded CSV/XLSX (base64) into CSV text for the shared pipeline.
 */
export async function parseImportFileAction(input: {
  fileName: string;
  base64: string;
}): Promise<ParseImportFileActionResult> {
  const t = await getTranslations('imports');
  try {
    if (!input.base64 || input.base64.length > MAX_IMPORT_UPLOAD_CHARS) {
      return { ok: false, error: t('errors.fileTooLarge') };
    }
    const lower = input.fileName.toLowerCase();
    const buffer = Buffer.from(input.base64, 'base64');

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const { headers, rows } = await workbookFirstSheetToMatrix(buffer);
      if (headers.length === 0) {
        return { ok: false, error: t('errors.emptySheet') };
      }
      const csvText = rowsToCsv(headers, rows);
      return { ok: true, csvText };
    }

    // CSV / text
    const text = buffer.toString('utf8');
    if (!text.trim()) {
      return { ok: false, error: t('errors.needFile') };
    }
    return { ok: true, csvText: text };
  } catch {
    return { ok: false, error: t('errors.readFile') };
  }
}

export async function previewImportAction(input: {
  kind: string;
  csvText: string;
  mapping?: ColumnMapping;
  projectId?: string;
  boqId?: string;
}): Promise<PreviewImportActionResult> {
  const t = await getTranslations('imports');
  try {
    const preview = await withOrgContext(async (context) =>
      enrichImportPreview(
        context,
        previewImport(context, {
          kind: input.kind,
          csvText: input.csvText,
          mapping: input.mapping,
          projectId: input.projectId,
          boqId: input.boqId,
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
  projectId?: string;
  boqId?: string;
  planId?: string;
  contractId?: string;
}): Promise<ConfirmImportActionResult> {
  const t = await getTranslations('imports');
  try {
    const result = await confirmImportInBatches(withOrgContext, {
      kind: input.kind,
      csvText: input.csvText,
      mapping: input.mapping,
      rowNumbers: input.rowNumbers,
      projectId: input.projectId,
      boqId: input.boqId,
      planId: input.planId,
      contractId: input.contractId,
    });

    revalidatePath('/clients');
    revalidatePath('/vendors');
    revalidatePath('/workforce/employees');
    revalidatePath('/projects');
    revalidatePath('/jobs');
    revalidatePath('/expenses');
    revalidatePath('/settings/cost-categories');
    revalidatePath('/imports');
    if (input.projectId) {
      revalidatePath(`/projects/${input.projectId}`);
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: mapError(error, t('errors.confirmFailed')) };
  }
}
