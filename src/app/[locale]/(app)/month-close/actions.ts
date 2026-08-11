'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError, DomainRuleError } from '@/shared/errors';
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
  if (error instanceof DomainRuleError && error.messageKey.startsWith('monthClose.')) {
    const t = await getTranslations('monthClose');
    const key = error.messageKey.replace('monthClose.', '') as 'errors.monthClosed';
    try {
      return t(key);
    } catch {
      /* fall through */
    }
  }
  if (error instanceof AuthorizationError) {
    const t = await getTranslations('errors');
    return t('notAllowed');
  }
  if (error instanceof AppError) {
    const t = await getTranslations('errors');
    try {
      const key = error.messageKey.replace('errors.', '');
      return t(key as 'validationFailed');
    } catch {
      return error.message;
    }
  }
  const t = await getTranslations('errors');
  return t('unexpected');
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

export async function createMonthCloseAdjustmentAction(
  _prev: MonthCloseActionState,
  formData: FormData,
): Promise<MonthCloseActionState> {
  try {
    const typeRaw = String(formData.get('adjustmentType') ?? 'correction');
    const adjustmentType =
      typeRaw === 'supersede' || typeRaw === 'adjustment' ? typeRaw : 'correction';
    const adjustment = await withOrgContext((context) =>
      createMonthCloseAdjustment(context, {
        periodId: String(formData.get('periodId') ?? ''),
        adjustmentType,
        reason: String(formData.get('reason') ?? ''),
      }),
    );
    revalidatePath('/month-close');
    return { ok: true, periodId: adjustment.periodId };
  } catch (error) {
    return { error: await failMessage(error) };
  }
}
