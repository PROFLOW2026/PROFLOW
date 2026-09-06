'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  updateCommandCenterItemState,
  type CommandCenterSourceType,
} from '@/modules/command-center';
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
  readonly sourceType: 'expense_due_today' | 'expense_overdue' | 'payroll_due_today';
  readonly sourceId: string;
}): Promise<CommandCenterActionResult> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      if (
        input.sourceType === 'expense_due_today' ||
        input.sourceType === 'expense_overdue'
      ) {
        const { confirmExpensePaid } = await import(
          '@/modules/expenses/application/expense-payments'
        );
        await confirmExpensePaid(context, input.sourceId);
        return;
      }
      if (input.sourceType === 'payroll_due_today') {
        const { confirmPayrollPaid } = await import(
          '@/modules/workforce/application/payroll-payments'
        );
        await confirmPayrollPaid(context, input.sourceId);
      }
    });
    revalidatePath('/today');
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
