/**
 * Task-reminder idempotence.
 *
 * `app.emit_notification` upserts on (organization_id, recipient_user_id, dedupe_key)
 * and clears `resolved_at` / `dismissed_at`. The scan dedupe key is
 * `task_due_soon:{reminderId}:{recipientUserId}`, so a second emit does not
 * insert another row — it reopens the existing one.
 *
 * Skip that reopen while the row is still unresolved (surfaced or handled),
 * unless a snooze (`expires_at`) has passed. Emit again only when no unresolved
 * row exists (first time, or the previous row was resolved because the task
 * left the due set — done/cancelled are filtered before emit).
 */

export interface TaskReminderGateRow {
  readonly resolvedAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly expiresAt: Date | null;
}

export function shouldEmitTaskReminder(
  existing: readonly TaskReminderGateRow[],
  now: Date,
): boolean {
  const unresolved = existing.filter((row) => row.resolvedAt == null);
  if (unresolved.length === 0) return true;
  return unresolved.some(
    (row) => row.expiresAt != null && row.expiresAt.getTime() <= now.getTime(),
  );
}
