'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionErrorMessage } from '@/shared/errors';
import {
  closeMonthClosePeriod,
  createMonthCloseAdjustment,
  demoteMonthCloseToOpen,
  ensureMonthClosePeriod,
  markMonthCloseReady,
  refreshPeriodCompleteness,
} from '@/modules/month-close';
import type { MonthCloseActionState } from '@/modules/month-close/ui/month-close-panel';

async function failMessage(error: unknown): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tMonthClose = await getTranslations('monthClose');
  return mapServerActionErrorMessage(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      monthClose: (key) => tMonthClose(key as 'errors.monthClosed'),
    },
    rethrowUnknown: false,
  });
}

export async function ensureMonthClosePeriodAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const period = await withOrgContext((context) =>
      ensureMonthClosePeriod(context, {
        yearMonth: String(formData.get('yearMonth') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: period.id };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}

export async function refreshMonthCloseAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const periodId = String(formData.get('periodId') ?? '');
    await withOrgContext((context) => refreshPeriodCompleteness(context, periodId));
    revalidatePath('/month-close');
    return { ok: true, periodId };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}

export async function markMonthCloseReadyAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const period = await withOrgContext((context) =>
      markMonthCloseReady(context, { periodId: String(formData.get('periodId') ?? '') }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: period.id };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}

export async function demoteMonthCloseAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const period = await withOrgContext((context) =>
      demoteMonthCloseToOpen(context, { periodId: String(formData.get('periodId') ?? '') }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: period.id };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}

export async function closeMonthClosePeriodAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const period = await withOrgContext((context) =>
      closeMonthClosePeriod(context, {
        periodId: String(formData.get('periodId') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
      }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: period.id };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}

function optionalFormString(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  const value = String(raw).trim();
  return value.length === 0 ? null : value;
}

export async function createMonthCloseAdjustmentAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const amount = optionalFormString(formData, 'amount');
    const supersedesAdjustmentId = amount
      ? optionalFormString(formData, 'supersedesAdjustmentId')
      : null;
    const typeRaw = String(formData.get('adjustmentType') ?? 'correction');
    const adjustmentType = supersedesAdjustmentId
      ? 'supersede'
      : typeRaw === 'supersede' || typeRaw === 'adjustment'
        ? typeRaw
        : 'correction';
    const adjustment = await withOrgContext((context) =>
      createMonthCloseAdjustment(context, {
        periodId: String(formData.get('periodId') ?? ''),
        adjustmentType,
        reason: String(formData.get('reason') ?? ''),
        amount,
        currency: amount
          ? (optionalFormString(formData, 'currency') ?? context.organization.baseCurrency)
          : null,
        effectSide: amount
          ? (optionalFormString(formData, 'effectSide') as 'cost' | 'revenue' | null)
          : null,
        projectId: amount ? optionalFormString(formData, 'projectId') : null,
        supersedesAdjustmentId,
      }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: adjustment.periodId };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}
