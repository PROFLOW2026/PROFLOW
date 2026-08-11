import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getModuleVisibility } from '@/modules/tenancy';
import { upsertCommandCenterItemState } from '../data/item-states.repository';
import { assertSafeItemStateTransition } from '../domain/ranking';
import type { CommandCenterItemStateRecord } from '../domain/types';
import {
  updateCommandCenterItemStateSchema,
  type UpdateCommandCenterItemStateInput,
} from '../validation/schemas';

function snoozeUntil(days: number): Date {
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  until.setUTCHours(12, 0, 0, 0);
  return until;
}

/**
 * Snooze / handle command-center items.
 * Financial sources: snooze only (never handled/dismissed).
 */
export async function updateCommandCenterItemState(
  context: OrgContext,
  raw: UpdateCommandCenterItemStateInput,
): Promise<CommandCenterItemStateRecord> {
  assertPermission(context, PERMISSIONS.COMMAND_CENTER_READ);

  const modules = await getModuleVisibility(context);
  if (!modules.command_center) {
    throw new DomainRuleError(
      'Command Center module is not enabled for this organization',
      'commandCenter.errors.moduleOff',
    );
  }

  const parsed = updateCommandCenterItemStateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  const safety = assertSafeItemStateTransition(input.sourceType, input.state);
  if (!safety.ok) {
    throw new DomainRuleError(safety.reason, 'commandCenter.errors.unsafeState');
  }

  if (input.state === 'active') {
    return upsertCommandCenterItemState(context.db, {
      organizationId: context.organizationId,
      itemKey: input.itemKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      state: 'active',
      snoozedUntil: null,
      note: input.note ?? null,
      updatedByUserId: context.userId,
    });
  }

  return upsertCommandCenterItemState(context.db, {
    organizationId: context.organizationId,
    itemKey: input.itemKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    state: input.state,
    snoozedUntil: input.state === 'snoozed' ? snoozeUntil(input.snoozeDays ?? 1) : null,
    note: input.note ?? null,
    updatedByUserId: context.userId,
  });
}
