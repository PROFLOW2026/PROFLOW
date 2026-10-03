'use server';



import { revalidatePath } from 'next/cache';

import { getLocale, getTranslations } from 'next-intl/server';

import type { DefectSeverity } from '@/modules/defects/domain/lifecycle';

import { resolveProjectRouteBase } from '@/modules/project-workspace/domain/project-surface-path';
import { checked, mapQualityError, optionalText, text } from '@/modules/defects/ui/action-helpers';

import type { QualityFormState } from '@/modules/defects/ui/form-state';

import { withOrgContext } from '@/shared/auth/session';

import { redirect } from '@/shared/i18n/navigation';

import {

  cancelInspection,

  createInspection,

  recordInspectionOutcome,

  saveChecklistResults,

  startInspection,

  startReinspection,

  updateInspection,

} from '../application/manage-inspections';

import type { CheckResult, InspectionOutcome } from '../domain/rules';



async function revalidateInspection(projectId: string, inspectionId?: string): Promise<void> {

  const locale = await getLocale();

  revalidatePath(`/${locale}/projects/${projectId}/inspections`);

  if (inspectionId) revalidatePath(`/${locale}/projects/${projectId}/inspections/${inspectionId}`);

}



async function done(projectId: string, inspectionId: string, messageKey: string): Promise<QualityFormState> {

  await revalidateInspection(projectId, inspectionId);

  const t = await getTranslations('inspections');

  return { success: t(messageKey as 'title'), nonce: Date.now() };

}



function parseResultsJson(formData: FormData) {

  const raw = text(formData, 'resultsJson');

  if (!raw) return [];

  try {

    const parsed = JSON.parse(raw) as { itemId: string; result: CheckResult; note?: string | null }[];

    return parsed.map((row) => ({

      itemId: row.itemId,

      result: row.result,

      note: row.note ?? null,

    }));

  } catch {

    return [];

  }

}



function extraItemsFrom(formData: FormData): string[] {

  const raw = text(formData, 'extraItems');

  if (!raw) return [];

  return raw

    .split('\n')

    .map((line) => line.trim())

    .filter(Boolean);

}



export async function createInspectionAction(

  projectId: string,

  _prev: QualityFormState,

  formData: FormData,

): Promise<QualityFormState> {

  let inspectionId: string;

  try {

    const created = await withOrgContext((context) =>

      createInspection(context, {

        projectId,

        templateRef: text(formData, 'templateRef'),

        title: text(formData, 'title') ?? '',

        scheduledFor: text(formData, 'scheduledFor'),

        locationId: text(formData, 'locationId'),

        subcontractAgreementId: text(formData, 'agreementId'),

        workLineId: text(formData, 'workLineId'),

        workPackageId: text(formData, 'workPackageId'),

        milestoneId: text(formData, 'milestoneId'),

        inspectorUserId: text(formData, 'inspectorUserId'),

        contractorVisible: checked(formData, 'contractorVisible'),

        extraItems: extraItemsFrom(formData),

      }),

    );

    inspectionId = created.inspectionId;

  } catch (error) {

    return mapQualityError(error);

  }

  await revalidateInspection(projectId);

  redirect({
    href: `${resolveProjectRouteBase(projectId, 'inspections', text(formData, 'returnBase'))}/${inspectionId}`,
    locale: await getLocale(),
  });

  return {};

}



export async function updateInspectionAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  formData: FormData,

): Promise<QualityFormState> {

  try {

    await withOrgContext((context) =>

      updateInspection(context, inspectionId, {

        title: text(formData, 'title') ?? undefined,

        scheduledFor: optionalText(formData, 'scheduledFor'),

        locationId: optionalText(formData, 'locationId'),

        subcontractAgreementId: optionalText(formData, 'agreementId'),

        workLineId: optionalText(formData, 'workLineId'),

        workPackageId: optionalText(formData, 'workPackageId'),

        milestoneId: optionalText(formData, 'milestoneId'),

        inspectorUserId: optionalText(formData, 'inspectorUserId'),

        contractorVisible: formData.has('contractorVisible') ? checked(formData, 'contractorVisible') : undefined,

      }),

    );

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'edit.success');

}



export async function startInspectionAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  _formData: FormData,

): Promise<QualityFormState> {

  try {

    await withOrgContext((context) => startInspection(context, inspectionId));

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'actions.started');

}



export async function saveChecklistAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  formData: FormData,

): Promise<QualityFormState> {

  try {

    await withOrgContext((context) => saveChecklistResults(context, inspectionId, parseResultsJson(formData)));

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'checklist.saved');

}



export async function recordOutcomeAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  formData: FormData,

): Promise<QualityFormState> {

  const outcome = (text(formData, 'outcome') ?? 'pass') as InspectionOutcome;

  const createDefects = checked(formData, 'createDefects');

  const createTask = checked(formData, 'createTask');

  try {

    await withOrgContext((context) =>

      recordInspectionOutcome(context, inspectionId, {

        results: parseResultsJson(formData),

        outcome,

        summary: text(formData, 'summary'),

        conditions: text(formData, 'conditions'),

        followUp: {

          createDefects,

          defectSeverity: (text(formData, 'defectSeverity') ?? 'medium') as DefectSeverity,

          defectDueDate: text(formData, 'defectDueDate'),

          createTask,

          taskTitle: text(formData, 'taskTitle'),

          taskDueDate: text(formData, 'taskDueDate'),

        },

      }),

    );

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'outcomeForm.recorded');

}



export async function reinspectAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  formData: FormData,

): Promise<QualityFormState> {

  try {

    await withOrgContext((context) =>

      startReinspection(context, inspectionId, { scheduledFor: text(formData, 'scheduledFor') }),

    );

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'actions.reinspected');

}



export async function cancelInspectionAction(

  projectId: string,

  inspectionId: string,

  _prev: QualityFormState,

  _formData: FormData,

): Promise<QualityFormState> {

  try {

    await withOrgContext((context) => cancelInspection(context, inspectionId));

  } catch (error) {

    return mapQualityError(error);

  }

  return done(projectId, inspectionId, 'actions.cancelled');

}


