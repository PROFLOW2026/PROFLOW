'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import {
  assignDefect,
  cancelDefect,
  createDefect,
  reopenDefect,
  startDefectVerification,
  submitDefectCompletionInternal,
  updateDefect,
  verifyDefect,
} from '../application/manage-defects';
import { submitDefectCompletion } from '../application/contractor-defects';
import type { DefectMode, DefectSeverity } from '../domain/lifecycle';
import { resolveProjectRouteBase } from '@/modules/project-workspace/domain/project-surface-path';
import { checked, mapQualityError, optionalText, text } from './action-helpers';
import type { QualityFormState } from './form-state';

async function revalidateDefect(projectId: string, defectId?: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/defects`);
  if (defectId) revalidatePath(`/${locale}/projects/${projectId}/defects/${defectId}`);
}

async function done(projectId: string, defectId: string, messageKey: string): Promise<QualityFormState> {
  await revalidateDefect(projectId, defectId);
  const t = await getTranslations('defects');
  return { success: t(messageKey as 'title'), nonce: Date.now() };
}

/** `contractor` select value: an agreement id (vendor derived server-side). */
function responsibleFrom(formData: FormData) {
  return {
    subcontractAgreementId: text(formData, 'agreementId'),
    workLineId: text(formData, 'workLineId'),
    assigneeUserId: text(formData, 'assigneeUserId'),
  };
}

export async function createDefectAction(
  projectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  let defectId: string;
  try {
    const created = await withOrgContext((context) =>
      createDefect(context, {
        projectId,
        title: text(formData, 'title') ?? '',
        description: text(formData, 'description'),
        severity: (text(formData, 'severity') ?? 'medium') as DefectSeverity,
        dueDate: text(formData, 'dueDate'),
        locationId: text(formData, 'locationId'),
        inspectorUserId: text(formData, 'inspectorUserId'),
        mode: (text(formData, 'mode') ?? 'construction') as DefectMode,
        contractorVisible: checked(formData, 'contractorVisible'),
        ...responsibleFrom(formData),
      }),
    );
    defectId = created.defectId;
  } catch (error) {
    return mapQualityError(error);
  }
  await revalidateDefect(projectId);
  redirect({
    href: `${resolveProjectRouteBase(projectId, 'defects', text(formData, 'returnBase'))}/${defectId}`,
    locale: await getLocale(),
  });
  return {};
}

export async function updateDefectAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) =>
      updateDefect(context, defectId, {
        title: text(formData, 'title') ?? undefined,
        description: optionalText(formData, 'description'),
        severity: (text(formData, 'severity') ?? undefined) as DefectSeverity | undefined,
        dueDate: optionalText(formData, 'dueDate'),
        locationId: optionalText(formData, 'locationId'),
        inspectorUserId: optionalText(formData, 'inspectorUserId'),
        contractorVisible: checked(formData, 'contractorVisible'),
      }),
    );
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'edit.success');
}

export async function assignDefectAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) =>
      assignDefect(context, defectId, {
        ...responsibleFrom(formData),
        dueDate: optionalText(formData, 'dueDate'),
        note: text(formData, 'note'),
      }),
    );
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'assign.success');
}

export async function submitDefectCompletionInternalAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) =>
      submitDefectCompletionInternal(context, defectId, { note: text(formData, 'note') }),
    );
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'completion.success');
}

export async function startDefectVerificationAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  _formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) => startDefectVerification(context, defectId));
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'verify.started');
}

export async function verifyDefectAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  const decision = text(formData, 'decision') === 'reject' ? 'reject' : 'accept';
  try {
    await withOrgContext((context) =>
      verifyDefect(context, defectId, {
        decision,
        note: text(formData, 'note'),
        dueDate: optionalText(formData, 'dueDate'),
      }),
    );
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, decision === 'accept' ? 'verify.accepted' : 'verify.rejected');
}

export async function reopenDefectAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) =>
      reopenDefect(context, defectId, { note: text(formData, 'note'), dueDate: optionalText(formData, 'dueDate') }),
    );
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'reopen.success');
}

export async function cancelDefectAction(
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    await withOrgContext((context) => cancelDefect(context, defectId, { note: text(formData, 'note') }));
  } catch (error) {
    return mapQualityError(error);
  }
  return done(projectId, defectId, 'cancel.success');
}

/** Contractor portal: submit the repair of the current cycle (evidence uploaded beforehand). */
export async function submitContractorDefectCompletionAction(
  organizationId: string,
  projectId: string,
  defectId: string,
  _prev: QualityFormState,
  formData: FormData,
): Promise<QualityFormState> {
  try {
    const context = await requireExternalContext();
    await submitDefectCompletion(context, { organizationId, defectId, note: text(formData, 'note') });
  } catch (error) {
    return mapQualityError(error);
  }
  const locale = await getLocale();
  revalidatePath(`/${locale}/contractor/projects/${projectId}/defects`);
  revalidatePath(`/${locale}/contractor/projects/${projectId}/defects/${defectId}`);
  const t = await getTranslations('defects');
  return { success: t('portal.submitted'), nonce: Date.now() };
}
