'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import type { DeductionType } from '../domain/types';
import {
  cancelContractorClaim,
  certifyClaim,
  createClaim,
  issueDeduction,
  reassessClaim,
  returnClaim,
  saveClaimDraft,
  saveContractorClaimDraft,
  startClaimReview,
  startContractorClaimCorrection,
  submitClaim,
  submitContractorClaim,
} from '../index';

type ActionState = { error?: string } | null;

async function mapError(error: unknown): Promise<ActionState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  const t = await getTranslations('subcontractClaims');
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as never),
    namespaces: { subcontractClaims: (key) => t(key as never) },
  });
  return { error: mapped.error };
}

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function startReviewAction(formData: FormData): Promise<void> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  await withOrgContext((context) => startClaimReview(context, projectId, claimId));
  revalidatePath(`${basePath}/${claimId}`);
}

export async function returnClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  try {
    await withOrgContext((context) => returnClaim(context, projectId, claimId, { reason: field(formData, 'reason') }));
    revalidatePath(`${basePath}/${claimId}`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}

export async function certifyClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  const lines: { claimLineId: string; certifiedAmount: string; reason?: string }[] = [];
  for (let index = 0; index < 200; index += 1) {
    const id = formData.get(`lines.${index}.claimLineId`);
    if (!id) break;
    lines.push({
      claimLineId: String(id),
      certifiedAmount: field(formData, `lines.${index}.certifiedAmount`),
      reason: field(formData, `lines.${index}.reason`) || undefined,
    });
  }
  try {
    await withOrgContext((context) => certifyClaim(context, projectId, claimId, { lines }));
    revalidatePath(`${basePath}/${claimId}`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}

export async function reassessClaimAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  const lines: { claimLineId: string; certifiedAmount: string }[] = [];
  for (let index = 0; index < 200; index += 1) {
    const id = formData.get(`lines.${index}.claimLineId`);
    if (!id) break;
    lines.push({ claimLineId: String(id), certifiedAmount: field(formData, `lines.${index}.certifiedAmount`) });
  }
  try {
    await withOrgContext((context) =>
      reassessClaim(context, projectId, claimId, { reason: field(formData, 'reason'), lines }),
    );
    revalidatePath(`${basePath}/${claimId}`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}

export async function submitInternalClaimAction(formData: FormData): Promise<void> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  await withOrgContext((context) => submitClaim(context, projectId, claimId));
  revalidatePath(`${basePath}/${claimId}`);
}

export async function createClaimAction(formData: FormData): Promise<void> {
  const projectId = field(formData, 'projectId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  const result = await withOrgContext((context) =>
    createClaim(context, {
      projectId,
      agreementId: field(formData, 'agreementId'),
      periodStart: field(formData, 'periodStart'),
      periodEnd: field(formData, 'periodEnd'),
      title: field(formData, 'title') || null,
    }),
  );
  redirect(`${basePath}/${result.claimId}`);
}

export async function saveClaimDraftAction(formData: FormData): Promise<ActionState> {
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  const basePath = field(formData, 'basePath') || `/projects/${projectId}/claims`;
  const linesJson = field(formData, 'linesJson');
  try {
    const lines = JSON.parse(linesJson) as Parameters<typeof saveClaimDraft>[3]['lines'];
    await withOrgContext((context) =>
      saveClaimDraft(context, projectId, claimId, {
        periodStart: field(formData, 'periodStart') || undefined,
        periodEnd: field(formData, 'periodEnd') || undefined,
        title: field(formData, 'title') || null,
        note: field(formData, 'note') || null,
        lines,
      }),
    );
    revalidatePath(`${basePath}/${claimId}`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}

export async function issueDeductionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await withOrgContext((context) =>
      issueDeduction(context, {
        projectId: field(formData, 'projectId'),
        agreementId: field(formData, 'agreementId'),
        claimId: field(formData, 'claimId') || null,
        deductionType: field(formData, 'deductionType') as DeductionType,
        amount: field(formData, 'amount'),
        reason: field(formData, 'reason'),
        contractorVisible: formData.get('contractorVisible') === 'on',
      }),
    );
    revalidatePath(`/projects/${field(formData, 'projectId')}/deductions`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}

export async function submitContractorClaimAction(formData: FormData): Promise<void> {
  const context = await requireExternalContext();
  const organizationId = field(formData, 'organizationId');
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  await submitContractorClaim(context, organizationId, projectId, claimId);
  revalidatePath(`/contractor/projects/${projectId}/claims/${claimId}`);
}

export async function startContractorCorrectionAction(formData: FormData): Promise<void> {
  const context = await requireExternalContext();
  const organizationId = field(formData, 'organizationId');
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  await startContractorClaimCorrection(context, organizationId, projectId, claimId);
  revalidatePath(`/contractor/projects/${projectId}/claims/${claimId}`);
}

export async function cancelContractorClaimAction(formData: FormData): Promise<void> {
  const context = await requireExternalContext();
  const organizationId = field(formData, 'organizationId');
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  await cancelContractorClaim(context, organizationId, projectId, claimId);
  revalidatePath(`/contractor/projects/${projectId}/claims`);
}

export async function saveContractorClaimDraftAction(formData: FormData): Promise<ActionState> {
  const context = await requireExternalContext();
  const organizationId = field(formData, 'organizationId');
  const projectId = field(formData, 'projectId');
  const claimId = field(formData, 'claimId');
  try {
    const lines = JSON.parse(field(formData, 'linesJson')) as Parameters<typeof saveContractorClaimDraft>[4]['lines'];
    await saveContractorClaimDraft(context, organizationId, projectId, claimId, {
      note: field(formData, 'note') || null,
      lines,
    });
    revalidatePath(`/contractor/projects/${projectId}/claims/${claimId}`);
    return null;
  } catch (error) {
    return mapError(error);
  }
}
