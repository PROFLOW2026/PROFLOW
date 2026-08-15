/**
 * Mirrors app.emit_notification ON CONFLICT (org, recipient, dedupe_key).
 * Used in unit tests so upsert semantics are pinned without a database.
 */

export interface EmittedNotificationState {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly type: string;
  readonly domain: string;
  readonly title: string;
  readonly body: string;
  readonly severity: string;
  readonly deepLink: string | null;
  readonly dedupeKey: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly expiresAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly readAt: Date | null;
}

export interface EmitUpsertPatch {
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly type: string;
  readonly domain: string;
  readonly title: string;
  readonly body: string;
  readonly severity: string;
  readonly deepLink: string | null;
  readonly dedupeKey: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly expiresAt: Date | null;
}

function conflictKey(row: {
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly dedupeKey: string;
}): string {
  return `${row.organizationId}\0${row.recipientUserId}\0${row.dedupeKey}`;
}

export function applyEmitUpsert(
  existing: readonly EmittedNotificationState[],
  patch: EmitUpsertPatch,
  newId: string,
): EmittedNotificationState[] {
  const key = conflictKey(patch);
  const index = existing.findIndex((row) => conflictKey(row) === key);
  if (index < 0) {
    return [
      ...existing,
      {
        ...patch,
        id: newId,
        resolvedAt: null,
        dismissedAt: null,
        readAt: null,
      },
    ];
  }

  const current = existing[index]!;
  const next = [...existing];
  next[index] = {
    ...current,
    title: patch.title,
    body: patch.body,
    severity: patch.severity,
    deepLink: patch.deepLink,
    metadata: patch.metadata,
    expiresAt: patch.expiresAt,
    resolvedAt: null,
    dismissedAt: null,
  };
  return next;
}
