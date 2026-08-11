'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  cancelApprovalRequest,
  createApprovalRule,
  createApprovalRuleSchema,
  decideApprovalRequest,
  updateApprovalRule,
  updateApprovalRuleSchema,
} from '@/modules/approvals';
import { withOrgContext } from '@/shared/auth/session';
import { serializeError, ValidationError } from '@/shared/errors';

export interface ApprovalsActionState {
  ok?: boolean;
  error?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createApprovalRuleAction(
  _prev: ApprovalsActionState,
  formData: FormData,
): Promise<ApprovalsActionState> {
  const t = await getTranslations('approvals');
  const tErrors = await getTranslations('errors');
  const enabledRaw = formValue(formData, 'enabled');
  const thresholdRaw = formValue(formData, 'thresholdAmount');
  const currencyRaw = formValue(formData, 'currency');
  const parsed = createApprovalRuleSchema.safeParse({
    name: formValue(formData, 'name'),
    entityType: formValue(formData, 'entityType'),
    thresholdAmount: thresholdRaw ?? null,
    currency: currencyRaw ?? null,
    enabled: enabledRaw === undefined ? true : enabledRaw === 'true' || enabledRaw === 'on',
  });
  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }
  try {
    await withOrgContext((context) => createApprovalRule(context, parsed.data));
    revalidatePath('/approvals');
    revalidatePath('/settings/approvals');
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    if (serialized.messageKey.startsWith('approvals.')) {
      return { error: t(serialized.messageKey.replace('approvals.', '') as 'errors.pending') };
    }
    return { error: tErrors(serialized.messageKey.replace('errors.', '') as 'notAllowed') };
  }
}

export async function toggleApprovalRuleAction(
  _prev: ApprovalsActionState,
  formData: FormData,
): Promise<ApprovalsActionState> {
  const tErrors = await getTranslations('errors');
  const parsed = updateApprovalRuleSchema.safeParse({
    ruleId: formValue(formData, 'ruleId'),
    enabled: formValue(formData, 'enabled') === 'true',
  });
  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }
  try {
    await withOrgContext((context) => updateApprovalRule(context, parsed.data));
    revalidatePath('/approvals');
    revalidatePath('/settings/approvals');
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    return { error: tErrors(serialized.messageKey.replace('errors.', '') as 'notAllowed') };
  }
}

export async function decideApprovalAction(
  _prev: ApprovalsActionState,
  formData: FormData,
): Promise<ApprovalsActionState> {
  const t = await getTranslations('approvals');
  const tErrors = await getTranslations('errors');
  const decision = formValue(formData, 'decision');
  if (decision !== 'approved' && decision !== 'rejected') {
    return { error: tErrors('validationFailed') };
  }
  try {
    await withOrgContext((context) =>
      decideApprovalRequest(context, {
        requestId: formValue(formData, 'requestId')!,
        decision,
        decisionNote: formValue(formData, 'decisionNote') ?? null,
      }),
    );
    revalidatePath('/approvals');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: tErrors('validationFailed') };
    }
    const serialized = serializeError(error);
    if (serialized.messageKey.startsWith('approvals.')) {
      return { error: t(serialized.messageKey.replace(/^approvals\./, '') as 'errors.pending') };
    }
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}

export async function cancelApprovalAction(
  _prev: ApprovalsActionState,
  formData: FormData,
): Promise<ApprovalsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      cancelApprovalRequest(context, {
        requestId: formValue(formData, 'requestId')!,
        decisionNote: formValue(formData, 'decisionNote') ?? null,
      }),
    );
    revalidatePath('/approvals');
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}
