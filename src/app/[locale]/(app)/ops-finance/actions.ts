'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createLinkedExpenseFromOpsRecord,
  type CreateLinkedExpenseInput,
  type OpsRecordKind,
} from '@/modules/ops-finance';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface OpsFinanceFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  expenseId?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function optionalUuidOrNull(formData: FormData, key: string): string | null | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '' || text === '__none__') return null;
  return text;
}

async function mapAppError(error: unknown): Promise<OpsFinanceFormState> {
  const tErrors = await getTranslations('errors');
  const tAssets = await getTranslations('assets');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      opsFinance: (key) => {
        const short = key.replace(/^errors\./, '');
        return tAssets(`financeLink.errors.${short}` as 'financeLink.errors.alreadyLinked');
      },
    },
  });
}

export async function createLinkedExpenseAction(
  _prev: OpsFinanceFormState,
  formData: FormData,
): Promise<OpsFinanceFormState> {
  try {
    const opsRecordKind = formValue(formData, 'opsRecordKind') as OpsRecordKind | undefined;
    const opsRecordId = formValue(formData, 'opsRecordId');
    if (!opsRecordKind || !opsRecordId) {
      return { error: 'Missing operational record' };
    }

    const allocationPeriodStart = formValue(formData, 'allocationPeriodStart');
    const allocationPeriodEnd = formValue(formData, 'allocationPeriodEnd');
    const hasAllocationPeriod = Boolean(allocationPeriodStart && allocationPeriodEnd);

    const input: CreateLinkedExpenseInput = {
      opsRecordKind,
      opsRecordId,
      amount: formValue(formData, 'amount'),
      currency: formValue(formData, 'currency'),
      description: formValue(formData, 'description'),
      costFamily: formValue(formData, 'costFamily') as CreateLinkedExpenseInput['costFamily'],
      projectId: optionalUuidOrNull(formData, 'projectId'),
      vendorId: optionalUuidOrNull(formData, 'vendorId'),
      expenseDate: formValue(formData, 'expenseDate'),
      notes: formValue(formData, 'notes'),
      allocationPeriodStart,
      allocationPeriodEnd,
      // Period filled → use existing allocation engine defaults (insurance-like overhead).
      allocationDriverMethod: hasAllocationPeriod
        ? ((formValue(formData, 'allocationDriverMethod') as
            | CreateLinkedExpenseInput['allocationDriverMethod']
            | undefined) ?? 'contract_weight')
        : undefined,
      allocationScheduleMode: hasAllocationPeriod
        ? ((formValue(formData, 'allocationScheduleMode') as
            | CreateLinkedExpenseInput['allocationScheduleMode']
            | undefined) ?? 'annual')
        : undefined,
      vatMode: formValue(formData, 'vatMode') as CreateLinkedExpenseInput['vatMode'],
    };

    const result = await withOrgContext((context) =>
      createLinkedExpenseFromOpsRecord(context, input),
    );

    const assetId = formValue(formData, 'assetId');
    const revalidate = formValue(formData, 'revalidatePath') ?? '/expenses';
    revalidatePath(revalidate);
    if (assetId) revalidatePath(`/assets/${assetId}`);
    if (opsRecordKind === 'compliance_artifact' || opsRecordKind === 'recurring_business_cost') {
      revalidatePath(`/compliance/${opsRecordId}`);
      revalidatePath('/compliance');
    }
    revalidatePath('/expenses');

    return { success: true, expenseId: result.expenseId };
  } catch (error) {
    return mapAppError(error);
  }
}
