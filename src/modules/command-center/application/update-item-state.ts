import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
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
 * Snooze / handle / dismiss command-center items.
 * Financial handle and dismiss are rejected while the source would still emit
 * the item. Snooze is allowed. Confirm-paid records a real payment elsewhere.
 */
export async function updateCommandCenterItemState(
  context: OrgContext,
  raw: UpdateCommandCenterItemStateInput,
): Promise<CommandCenterItemStateRecord> {
  assertPermission(context, PERMISSIONS.COMMAND_CENTER_READ);

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

  const record = await upsertCommandCenterItemState(context.db, {
    organizationId: context.organizationId,
    itemKey: input.itemKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    state: input.state,
    snoozedUntil: input.state === 'snoozed' ? snoozeUntil(input.snoozeDays ?? 1) : null,
    note: input.note ?? null,
    updatedByUserId: context.userId,
  });

  // cc: rows are not notification records, so the shell delta never clears them.
  // Recompute this actor's snapshot only. Never another user, never service role.
  // A badge failure must not undo the state change.
  try {
    const { refreshActorAttentionBadge } = await import(
      '@/modules/notifications/application/attention-badge'
    );
    await refreshActorAttentionBadge(context);
  } catch {
    // refreshActorAttentionBadge already isolates its savepoint.
  }

  return record;
}
