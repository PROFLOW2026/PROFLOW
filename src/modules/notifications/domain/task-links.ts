const OWNER_TASK_PATH = /^\/tasks\/([^/?#]+)/;

/** Locale-stripped path. Employee recipients use the employee task route. */
export function taskDeepLinkForRecipient(
  deepLink: string,
  recipientIsEmployee: boolean,
): string {
  if (!recipientIsEmployee) return deepLink;
  const match = OWNER_TASK_PATH.exec(deepLink);
  const taskId = match?.[1];
  if (!taskId) return deepLink;
  return `/employee/tasks/${taskId}`;
}

export function dedupeReminderScanRows<T extends { readonly id: string; readonly recipientUserId?: string | null }>(
  entities: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entity of entities) {
    const key = `${entity.id}\0${entity.recipientUserId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entity);
  }
  return out;
}
