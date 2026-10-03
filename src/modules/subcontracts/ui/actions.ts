'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import {
  approveChange,
  cancelUnpricedWork,
  changeAgreementStatus,
  convertUnpricedWorkToChange,
  counterContractorChange,
  createChange,
  createDraftAgreement,
  proposeChangeVersion,
  recordUnpricedWork,
  rejectChange,
  rejectUnpricedWork,
  submitChange,
  submitContractorChangeProposal,
  updateAgreement,
  updateAgreementFinancialTerms,
  addWorkLine,
  archiveWorkLine,
  updateWorkLine,
  withdrawChange,
} from '../index';
import type { AgreementLifecycleAction, SubcontractChangeType, SubcontractLineType } from '../domain/types';
import type { SubcontractFormState } from './form-state';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw == null) return undefined;
  const text = String(raw).trim();
  return text === '' ? undefined : text;
}

/** Present-but-empty -> '' (explicit clear); absent -> undefined (unchanged). */
function editable(formData: FormData, key: string): string | undefined {
  if (!formData.has(key)) return undefined;
  return String(formData.get(key) ?? '').trim();
}

function required(formData: FormData, key: string): string {
  return value(formData, key) ?? '';
}

function versionLines(formData: FormData) {
  const lines: {
    workLineId?: string;
    newLineDescription?: string;
    newLineUnit?: string;
    newLineType?: SubcontractLineType;
    quantityDelta?: string;
    unitRate?: string;
    amountDelta?: string;
  }[] = [];
  for (let index = 0; index < 50; index += 1) {
    const prefix = `lines.${index}.`;
    if (!formData.has(`${prefix}target`)) continue;
    const target = value(formData, `${prefix}target`);
    const newDescription = value(formData, `${prefix}newLineDescription`);
    const quantityDelta = value(formData, `${prefix}quantityDelta`);
    const unitRate = value(formData, `${prefix}unitRate`);
    const amountDelta = value(formData, `${prefix}amountDelta`);
    if (!target && !newDescription && !quantityDelta && !unitRate && !amountDelta) continue;
    lines.push({
      ...(target && target !== 'new' ? { workLineId: target } : { newLineDescription: newDescription }),
      ...(target === 'new'
        ? {
            newLineUnit: value(formData, `${prefix}newLineUnit`),
            newLineType: (value(formData, `${prefix}newLineType`) as SubcontractLineType | undefined) ?? 'lump_sum',
          }
        : {}),
      quantityDelta,
      unitRate,
      amountDelta,
    });
  }
  return lines;
}

async function mapError(error: unknown): Promise<SubcontractFormState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  const t = await getTranslations('subcontracts');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as never),
    namespaces: { subcontracts: (key) => t(key as never) },
  });
}

function revalidateProject(projectId: string | undefined, agreementId?: string) {
  if (!projectId) return;
  revalidatePath(`/projects/${projectId}/unpriced-work`);
  if (agreementId) {
    revalidatePath(`/projects/${projectId}/contractors/${agreementId}`);
    revalidatePath(`/projects/${projectId}/contractors/${agreementId}/lines`);
    revalidatePath(`/projects/${projectId}/contractors/${agreementId}/changes`);
  }
}

async function run(
  formData: FormData,
  fn: () => Promise<unknown>,
): Promise<SubcontractFormState> {
  try {
    await fn();
    revalidateProject(value(formData, 'projectId'), value(formData, 'agreementId'));
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

// ── Agreements ───────────────────────────────────────────────────────────────

export async function createDraftAgreementAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  try {
    const created = await withOrgContext((context) =>
      createDraftAgreement(context, {
        projectId: required(formData, 'projectId'),
        vendorId: required(formData, 'vendorId'),
        title: required(formData, 'title'),
        subcontractNumber: value(formData, 'subcontractNumber'),
        trade: value(formData, 'trade'),
        workPackageId: value(formData, 'workPackageId'),
        scopeSummary: value(formData, 'scopeSummary'),
        startDate: value(formData, 'startDate'),
        endDate: value(formData, 'endDate'),
        originalAmount: value(formData, 'originalAmount'),
        retentionPercent: value(formData, 'retentionPercent'),
        retentionCapAmount: value(formData, 'retentionCapAmount'),
        advancePercent: value(formData, 'advancePercent'),
        vatTreatment: value(formData, 'vatTreatment') as never,
        paymentTermsDays: value(formData, 'paymentTermsDays'),
      }),
    );
    revalidateProject(value(formData, 'projectId'), created.agreementId);
    return { success: true, createdId: created.agreementId };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateAgreementAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      updateAgreement(context, {
        agreementId: required(formData, 'agreementId'),
        title: value(formData, 'title'),
        trade: editable(formData, 'trade'),
        scopeSummary: editable(formData, 'scopeSummary'),
        workPackageId: editable(formData, 'workPackageId'),
        subcontractNumber: editable(formData, 'subcontractNumber'),
        startDate: editable(formData, 'startDate'),
        endDate: editable(formData, 'endDate'),
      }),
    ),
  );
}

export async function updateFinancialTermsAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      updateAgreementFinancialTerms(context, {
        agreementId: required(formData, 'agreementId'),
        originalAmount: editable(formData, 'originalAmount'),
        retentionPercent: editable(formData, 'retentionPercent'),
        retentionCapPercent: editable(formData, 'retentionCapPercent'),
        retentionCapAmount: editable(formData, 'retentionCapAmount'),
        advancePercent: editable(formData, 'advancePercent'),
        advanceAmount: editable(formData, 'advanceAmount'),
        advanceRecoveryMethod: value(formData, 'advanceRecoveryMethod') as never,
        advanceRecoveryPercent: editable(formData, 'advanceRecoveryPercent'),
        vatTreatment: value(formData, 'vatTreatment') as never,
        paymentTermsDays: editable(formData, 'paymentTermsDays'),
        paymentTermsText: editable(formData, 'paymentTermsText'),
      }),
    ),
  );
}

export async function agreementLifecycleAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      changeAgreementStatus(context, {
        agreementId: required(formData, 'agreementId'),
        action: required(formData, 'action') as AgreementLifecycleAction,
        reason: value(formData, 'reason'),
      }),
    ),
  );
}

// ── Work lines ───────────────────────────────────────────────────────────────

export async function addWorkLineAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      addWorkLine(context, {
        agreementId: required(formData, 'agreementId'),
        code: value(formData, 'code'),
        description: required(formData, 'description'),
        unit: value(formData, 'unit'),
        quantity: value(formData, 'quantity'),
        lineType: (value(formData, 'lineType') as SubcontractLineType | undefined) ?? 'quantity_rate',
        weightPercent: value(formData, 'weightPercent'),
        plannedStart: value(formData, 'plannedStart'),
        plannedEnd: value(formData, 'plannedEnd'),
        locationId: value(formData, 'locationId'),
        workPackageId: value(formData, 'workPackageId'),
        unitPrice: value(formData, 'unitPrice'),
        contractAmount: value(formData, 'contractAmount'),
      }),
    ),
  );
}

export async function updateWorkLineAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      updateWorkLine(context, {
        workLineId: required(formData, 'workLineId'),
        code: editable(formData, 'code'),
        description: value(formData, 'description'),
        unit: editable(formData, 'unit'),
        quantity: value(formData, 'quantity'),
        lineType: value(formData, 'lineType') as SubcontractLineType | undefined,
        weightPercent: editable(formData, 'weightPercent'),
        plannedStart: editable(formData, 'plannedStart'),
        plannedEnd: editable(formData, 'plannedEnd'),
        locationId: editable(formData, 'locationId'),
        workPackageId: editable(formData, 'workPackageId'),
        unitPrice: value(formData, 'unitPrice'),
        contractAmount: value(formData, 'contractAmount'),
      }),
    ),
  );
}

export async function archiveWorkLineAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) => archiveWorkLine(context, { workLineId: required(formData, 'workLineId') })),
  );
}

// ── Changes ──────────────────────────────────────────────────────────────────

export async function createChangeAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      createChange(context, {
        agreementId: required(formData, 'agreementId'),
        changeType: required(formData, 'changeType') as SubcontractChangeType,
        title: required(formData, 'title'),
        description: value(formData, 'description'),
        timeExtensionDays: value(formData, 'timeExtensionDays'),
      }),
    ),
  );
}

export async function submitChangeAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) => submitChange(context, { changeId: required(formData, 'changeId') })),
  );
}

export async function proposeChangeVersionAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      proposeChangeVersion(context, {
        changeId: required(formData, 'changeId'),
        amount: value(formData, 'amount'),
        timeExtensionDays: value(formData, 'timeExtensionDays'),
        note: value(formData, 'note'),
        lines: versionLines(formData),
      }),
    ),
  );
}

export async function approveChangeAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      approveChange(context, {
        changeId: required(formData, 'changeId'),
        versionId: value(formData, 'versionId'),
        reason: value(formData, 'reason'),
      }),
    ),
  );
}

export async function rejectChangeAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      rejectChange(context, { changeId: required(formData, 'changeId'), reason: value(formData, 'reason') }),
    ),
  );
}

export async function withdrawChangeAction(_prev: SubcontractFormState, formData: FormData): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      withdrawChange(context, { changeId: required(formData, 'changeId'), reason: value(formData, 'reason') }),
    ),
  );
}

// ── Unpriced work ────────────────────────────────────────────────────────────

export async function recordUnpricedWorkAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      recordUnpricedWork(context, {
        agreementId: required(formData, 'unpricedAgreementId'),
        title: required(formData, 'title'),
        scopeDescription: value(formData, 'scopeDescription'),
        locationId: value(formData, 'locationId'),
        workPackageId: value(formData, 'workPackageId'),
        workDate: required(formData, 'workDate'),
        issuerName: value(formData, 'issuerName'),
      }),
    ),
  );
}

export async function convertUnpricedWorkAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  return run(formData, () =>
    withOrgContext((context) =>
      convertUnpricedWorkToChange(context, {
        unpricedWorkId: required(formData, 'unpricedWorkId'),
        changeType: value(formData, 'changeType') as SubcontractChangeType | undefined,
      }),
    ),
  );
}

export async function closeUnpricedWorkAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const decision = value(formData, 'decision');
  return run(formData, () =>
    withOrgContext((context) => {
      const input = { unpricedWorkId: required(formData, 'unpricedWorkId'), reason: value(formData, 'reason') };
      return decision === 'reject' ? rejectUnpricedWork(context, input) : cancelUnpricedWork(context, input);
    }),
  );
}

// ── Contractor portal (external principal; never an OrgContext) ─────────────

function revalidatePortal(projectId: string | undefined, agreementId: string | undefined) {
  if (!projectId || !agreementId) return;
  revalidatePath(`/contractor/projects/${projectId}/contracts/${agreementId}`);
  revalidatePath(`/contractor/projects/${projectId}/contracts/${agreementId}/changes`);
}

export async function contractorProposeChangeAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  try {
    const context = await requireExternalContext();
    await submitContractorChangeProposal(context, {
      organizationId: required(formData, 'organizationId'),
      projectId: required(formData, 'projectId'),
      agreementId: required(formData, 'agreementId'),
      title: required(formData, 'title'),
      description: value(formData, 'description'),
      changeType: (value(formData, 'changeType') as SubcontractChangeType | undefined) ?? 'contractor_proposal',
      amount: value(formData, 'amount'),
      timeExtensionDays: value(formData, 'timeExtensionDays'),
      note: value(formData, 'note'),
      lines: versionLines(formData),
    });
    revalidatePortal(value(formData, 'projectId'), value(formData, 'agreementId'));
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function contractorCounterChangeAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  try {
    const context = await requireExternalContext();
    await counterContractorChange(context, {
      organizationId: required(formData, 'organizationId'),
      changeId: required(formData, 'changeId'),
      amount: value(formData, 'amount'),
      timeExtensionDays: value(formData, 'timeExtensionDays'),
      note: value(formData, 'note'),
      lines: versionLines(formData),
    });
    revalidatePortal(value(formData, 'projectId'), value(formData, 'agreementId'));
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
