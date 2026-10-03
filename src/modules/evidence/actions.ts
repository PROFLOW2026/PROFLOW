'use server';

import { revalidatePath } from 'next/cache';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import {
  beginExternalEvidenceUpload,
  beginInternalEvidenceUpload,
  removeExternalEvidence,
  removeInternalEvidence,
  type BeginEvidenceUploadInput,
  type BeginExternalEvidenceUploadInput,
} from './application/upload-evidence';
import { projectFileDeps } from './server';

export type EvidenceActionResult =
  | { readonly ok: true; readonly uploadUrl: string; readonly evidenceId: string }
  | { readonly ok: false; readonly error: string; readonly fieldErrors?: Record<string, string> };

async function mapEvidenceError(error: unknown): Promise<{ ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const [tErrors, tValidation, tPlans] = await Promise.all([
    getTranslations('errors'),
    getTranslations('validation'),
    getTranslations('projectPlans'),
  ]);
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as never),
    tValidation: (key) => tValidation(key as never),
    namespaces: { projectPlans: (key) => tPlans(key as never) },
  });
  return { ok: false, error: mapped.error, ...(mapped.fieldErrors ? { fieldErrors: mapped.fieldErrors } : {}) };
}

export async function beginInternalEvidenceUploadAction(
  input: BeginEvidenceUploadInput,
): Promise<EvidenceActionResult> {
  try {
    const ticket = await withOrgContext((context) =>
      beginInternalEvidenceUpload(context, input, projectFileDeps),
    );
    return { ok: true, uploadUrl: ticket.uploadUrl, evidenceId: ticket.evidenceId };
  } catch (error) {
    return mapEvidenceError(error);
  }
}

export async function beginExternalEvidenceUploadAction(
  input: BeginExternalEvidenceUploadInput,
): Promise<EvidenceActionResult> {
  try {
    const context = await requireExternalContext();
    const ticket = await beginExternalEvidenceUpload(context, input, projectFileDeps);
    return { ok: true, uploadUrl: ticket.uploadUrl, evidenceId: ticket.evidenceId };
  } catch (error) {
    return mapEvidenceError(error);
  }
}

export async function removeInternalEvidenceAction(input: {
  readonly evidenceId: string;
  readonly revalidatePath?: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> {
  try {
    await withOrgContext((context) => removeInternalEvidence(context, input.evidenceId));
    if (input.revalidatePath) revalidatePath(input.revalidatePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (await mapEvidenceError(error)).error };
  }
}

export async function removeExternalEvidenceAction(input: {
  readonly organizationId: string;
  readonly evidenceId: string;
  readonly revalidatePath?: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> {
  try {
    const context = await requireExternalContext();
    await removeExternalEvidence(
      context,
      { organizationId: input.organizationId, evidenceId: input.evidenceId },
      projectFileDeps,
    );
    if (input.revalidatePath) revalidatePath(input.revalidatePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (await mapEvidenceError(error)).error };
  }
}
