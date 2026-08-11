'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  updateCommandCenterItemState,
  type CommandCenterSourceType,
} from '@/modules/command-center';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';

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
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
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
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
