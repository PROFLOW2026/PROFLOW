'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  updateCommandCenterItemState,
  type CommandCenterSourceType,
} from '@/modules/command-center';
import {
  EXPENSE_PAYMENT_SOURCE_TYPES,
  PAYROLL_PAYMENT_SOURCE_TYPES,
} from '@/modules/command-center/domain/types';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError, mapServerActionError } from '@/shared/errors';

export interface CommandCenterActionResult {
  readonly error?: string;
}

export async function snoozeCommandCenterItemAction(input: {
  readonly itemKey: string;
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
  readonly snoozeDays: number;
}): Promise<CommandCenterActionResult> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('commandCenter');

  try {
    await withOrgContext((context) =>
      updateCommandCenterItemState(context, {
        itemKey: input.itemKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        state: 'snoozed',
        snoozeDays: input.snoozeDays,
      }),
    );
    revalidatePath('/today');
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) {
      return { error: t('errors.unsafeState') };
    }
    if (error instanceof ValidationError || error instanceof AppError) {
      return mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
      });
    }
    throw error;
  }
}

export async function handleCommandCenterItemAction(input: {
  readonly itemKey: string;
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
}): Promise<CommandCenterActionResult> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('commandCenter');

  try {
    await withOrgContext((context) =>
      updateCommandCenterItemState(context, {
        itemKey: input.itemKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        state: 'handled',
      }),
    );
    revalidatePath('/today');
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) {
      return { error: t('errors.unsafeState') };
    }
    if (error instanceof ValidationError || error instanceof AppError) {
      return mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
      });
    }
    throw error;
  }
}

export async function confirmTodayPaymentAction(input: {
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
}): Promise<CommandCenterActionResult> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      if ((EXPENSE_PAYMENT_SOURCE_TYPES as readonly string[]).includes(input.sourceType)) {
        const { confirmExpensePaid } = await import(
          '@/modules/expenses/application/expense-payments'
        );
        await confirmExpensePaid(context, input.sourceId);
        return;
      }
      if ((PAYROLL_PAYMENT_SOURCE_TYPES as readonly string[]).includes(input.sourceType)) {
        const { confirmPayrollPaid } = await import(
          '@/modules/workforce/application/payroll-payments'
        );
        await confirmPayrollPaid(context, input.sourceId);
      }
    });
    revalidatePath('/today');
    revalidatePath('/notifications');
    revalidatePath('/financial');
    revalidatePath('/financials/overview');
    return {};
  } catch (error) {
    if (error instanceof DomainRuleError) {
      return { error: tErrors('unexpected') };
    }
    if (error instanceof ValidationError || error instanceof AppError) {
      return mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
      });
    }
    throw error;
  }
}
