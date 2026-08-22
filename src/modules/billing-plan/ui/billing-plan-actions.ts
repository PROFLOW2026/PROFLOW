'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  addPlanLine,
  createBillingCycle,
  createBillingPlan,
  archiveTemplate,
  applyBillingPlanTemplate,
  saveOrgBillingPlanTemplate,
  releasePlanRetention,
  duplicatePlanLine,
  issueBillingCycle,
  removePlanLine,
  renamePlanLine,
  reorderPlanLines,
  updateBillingPlan,
  updateCycleLines,
  updatePlanLine,
  type AddPlanLineInput,
  type CreateCycleInput,
  type CreatePlanInput,
  type IssueCycleInput,
  type ReorderPlanLinesInput,
  type UpdateCycleLinesInput,
  type UpdatePlanInput,
  type UpdatePlanLineInput,
} from '@/modules/billing-plan';
import { money, percentOfMoney, toNumericString } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, serializeError } from '@/shared/errors';
import { findPrimaryContractByProject } from '@/modules/projects';
import { computeCurrentContractValue } from '@/modules/projects';
import { listContractValueEvents } from '@/modules/projects/data/contracts.repository';

export interface BillingPlanActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  planId?: string;
  cycleId?: string;
  templateId?: string;
  message?: string;
  heldRemaining?: string;
}

function mapError(error: unknown, fallback: string): BillingPlanActionState {
  if (error instanceof AppError) {
    const serialized = serializeError(error);
    return { error: serialized.messageKey ?? fallback };
  }
  return { error: fallback };
}

function revalidateBillingPlanPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/billing-plan`);
}

async function resolveMessageKey(messageKey: string | undefined, fallback: string): Promise<string> {
  if (!messageKey) return fallback;
  if (messageKey.startsWith('billingPlan.')) {
    const t = await getTranslations('billingPlan');
    const key = messageKey.slice('billingPlan.'.length);
    try {
      return t(key as never);
    } catch {
      return fallback;
    }
  }
  if (messageKey.startsWith('errors.')) {
    const t = await getTranslations('errors');
    try {
      return t(messageKey.slice('errors.'.length) as never);
    } catch {
      return fallback;
    }
  }
  return messageKey;
}

export async function createBillingPlanAction(
  _prev: BillingPlanActionState,
  formData: FormData,
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('billingPlan');
  const mode = String(formData.get('mode') ?? 'blank');
  const projectId = String(formData.get('projectId') ?? '');
  const contractId = String(formData.get('contractId') ?? '');
  const name =
    String(formData.get('name') ?? '').trim() || t('create.namePlaceholder');
  const activate = formData.get('activate') === 'true';
  const professionTemplateKey = formData.get('professionTemplateKey')
    ? String(formData.get('professionTemplateKey'))
    : null;
  const templateId = formData.get('templateId')
    ? String(formData.get('templateId'))
    : null;
  const defaultRetentionPercent = formData.get('defaultRetentionPercent')
    ? String(formData.get('defaultRetentionPercent'))
    : null;

  try {
    const plan = await withOrgContext(async (context) => {
      const input: CreatePlanInput = {
        projectId,
        contractId,
        name,
        activate,
        defaultRetentionPercent,
        templateId: mode === 'template' && templateId ? templateId : null,
        professionTemplateKey:
          mode === 'template' && professionTemplateKey && !templateId
            ? professionTemplateKey
            : null,
      };
      const created = await createBillingPlan(context, input);

      if (mode === 'simple') {
        const events = await listContractValueEvents(
          context.db,
          context.organizationId,
          contractId,
        );
        const contractValue = computeCurrentContractValue(events, created.currency);
        const base = money(toNumericString(contractValue), created.currency);
        const simpleLines = [
          { label: t('create.simpleLine1'), percent: '30' },
          { label: t('create.simpleLine2'), percent: '40' },
          { label: t('create.simpleLine3'), percent: '30' },
        ] as const;
        for (let i = 0; i < simpleLines.length; i += 1) {
          const row = simpleLines[i]!;
          const amount = toNumericString(percentOfMoney(base, row.percent));
          await addPlanLine(context, {
            planId: created.id,
            label: row.label,
            lineKind: 'percent_of_contract',
            agreedPercent: row.percent,
            agreedAmount: amount,
            sortOrder: i,
          });
        }
      }

      return created;
    });

    revalidateBillingPlanPaths(projectId);
    return { success: true, planId: plan.id };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function updateBillingPlanAction(
  input: UpdatePlanInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => updateBillingPlan(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function addPlanLineAction(
  input: AddPlanLineInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => addPlanLine(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function updatePlanLineAction(
  input: UpdatePlanLineInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => updatePlanLine(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function removePlanLineAction(input: {
  planId: string;
  lineId: string;
  projectId: string;
}): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => removePlanLine(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function renamePlanLineAction(input: {
  planId: string;
  lineId: string;
  label: string;
  projectId: string;
}): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      renamePlanLine(context, {
        planId: input.planId,
        lineId: input.lineId,
        label: input.label,
      }),
    );
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function duplicatePlanLineAction(input: {
  planId: string;
  lineId: string;
  projectId: string;
}): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => duplicatePlanLine(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function reorderPlanLinesAction(
  input: ReorderPlanLinesInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => reorderPlanLines(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function createBillingCycleAction(
  _prev: BillingPlanActionState,
  formData: FormData,
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');
  const input: CreateCycleInput = {
    planId: String(formData.get('planId') ?? ''),
    title: String(formData.get('title') ?? ''),
    accountDate: String(formData.get('accountDate') ?? ''),
    periodStart: formData.get('periodStart') ? String(formData.get('periodStart')) : null,
    periodEnd: formData.get('periodEnd') ? String(formData.get('periodEnd')) : null,
    retentionPercent: formData.get('retentionPercent')
      ? String(formData.get('retentionPercent'))
      : null,
    notes: formData.get('notes') ? String(formData.get('notes')) : null,
    seedFromPlan: true,
  };

  try {
    const cycle = await withOrgContext((context) => createBillingCycle(context, input));
    revalidateBillingPlanPaths(projectId);
    return { success: true, cycleId: cycle.id, planId: input.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function updateCycleLinesAction(
  input: UpdateCycleLinesInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => updateCycleLines(context, input));
    revalidateBillingPlanPaths(input.projectId);
    return { success: true, cycleId: input.cycleId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function issueBillingCycleAction(
  input: IssueCycleInput & { projectId: string },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    const result = await withOrgContext((context) => issueBillingCycle(context, input));
    revalidateBillingPlanPaths(input.projectId);
    revalidatePath('/billing');
    return { success: true, cycleId: input.cycleId, planId: result.cycle.planId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function approveBillingCycleAction(
  input: { cycleId: string; projectId: string; approveAllRequested?: boolean },
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  try {
    const { approveBillingCycle } = await import('@/modules/billing-plan');
    await withOrgContext((context) =>
      approveBillingCycle(context, {
        cycleId: input.cycleId,
        approveAllRequested: input.approveAllRequested ?? true,
      }),
    );
    revalidateBillingPlanPaths(input.projectId);
    revalidatePath('/billing');
    return { success: true, cycleId: input.cycleId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function activateBillingPlanAction(
  formData: FormData,
): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const planId = String(formData.get('planId') ?? '');
  await withOrgContext((context) =>
    updateBillingPlan(context, { planId, status: 'active' }),
  );
  revalidateBillingPlanPaths(projectId);
}
export async function seedBillingPlanAfterProjectCreate(input: {
  projectId: string;
  mode: 'simple' | 'template';
  professionTemplateKey?: string | null;
}): Promise<{ planId?: string }> {
  const t = await getTranslations('billingPlan');
  const locale = await getLocale();
  void locale;

  try {
    const plan = await withOrgContext(async (context) => {
      const contract = await findPrimaryContractByProject(
        context.db,
        context.organizationId,
        input.projectId,
      );
      if (!contract) return null;

      if (input.mode === 'template' && input.professionTemplateKey) {
        return createBillingPlan(context, {
          projectId: input.projectId,
          contractId: contract.id,
          name: t('create.namePlaceholder'),
          activate: false,
          professionTemplateKey: input.professionTemplateKey,
        });
      }

      const created = await createBillingPlan(context, {
        projectId: input.projectId,
        contractId: contract.id,
        name: t('create.namePlaceholder'),
        activate: false,
      });

      const events = await listContractValueEvents(
        context.db,
        context.organizationId,
        contract.id,
      );
      const contractValue = computeCurrentContractValue(events, created.currency);
      const base = money(toNumericString(contractValue), created.currency);
      const simpleLines = [
        { label: t('create.simpleLine1'), percent: '30' },
        { label: t('create.simpleLine2'), percent: '40' },
        { label: t('create.simpleLine3'), percent: '30' },
      ] as const;
      for (let i = 0; i < simpleLines.length; i += 1) {
        const row = simpleLines[i]!;
        const amount = toNumericString(percentOfMoney(base, row.percent));
        await addPlanLine(context, {
          planId: created.id,
          label: row.label,
          lineKind: 'percent_of_contract',
          agreedPercent: row.percent,
          agreedAmount: amount,
          sortOrder: i,
        });
      }
      return created;
    });

    if (plan) {
      revalidateBillingPlanPaths(input.projectId);
      return { planId: plan.id };
    }
    return {};
  } catch {
    // Project create must succeed even if plan seeding fails.
    return {};
  }
}

export async function releasePlanRetentionAction(
  _prev: BillingPlanActionState,
  formData: FormData,
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('billingPlan');
  const projectId = String(formData.get('projectId') ?? '');
  const planId = String(formData.get('planId') ?? '');
  const amount = String(formData.get('amount') ?? '');
  const releasedOn = String(formData.get('releasedOn') ?? '');
  const notes = formData.get('notes') ? String(formData.get('notes')) : null;
  try {
    const result = await withOrgContext((context) =>
      releasePlanRetention(context, {
        planId,
        amount,
        releasedOn: releasedOn || undefined,
        notes,
      }),
    );
    revalidateBillingPlanPaths(projectId);
    return {
      success: true,
      planId,
      heldRemaining: result.heldRemaining,
      message: `${t('retention.remainingAfter')}: ${result.heldRemaining}`,
    };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function saveOrgTemplateAction(
  _prev: BillingPlanActionState,
  formData: FormData,
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');
  const sourcePlanId = String(formData.get('planId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  try {
    const template = await withOrgContext((context) =>
      saveOrgBillingPlanTemplate(context, {
        name,
        sourcePlanId,
      }),
    );
    revalidateBillingPlanPaths(projectId);
    return { success: true, planId: sourcePlanId, templateId: template.id };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function applyOrgTemplateAction(
  _prev: BillingPlanActionState,
  formData: FormData,
): Promise<BillingPlanActionState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');
  const planId = String(formData.get('planId') ?? '');
  const templateId = String(formData.get('templateId') ?? '');
  const replaceExisting = String(formData.get('replaceExisting') ?? '') === 'true';
  try {
    await withOrgContext((context) =>
      applyBillingPlanTemplate(context, {
        planId,
        templateId,
        replaceExisting,
      }),
    );
    revalidateBillingPlanPaths(projectId);
    return { success: true, planId, templateId };
  } catch (error) {
    if (error instanceof AppError) {
      const mapped = mapError(error, tErrors('validationFailed'));
      return {
        ...mapped,
        error: await resolveMessageKey(mapped.error, tErrors('validationFailed')),
      };
    }
    throw error;
  }
}

export async function archiveOrgTemplateAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const templateId = String(formData.get('templateId') ?? '');
  await withOrgContext(async (context) => {
    await archiveTemplate(context.db, context.organizationId, templateId);
  });
  revalidateBillingPlanPaths(projectId);
}
