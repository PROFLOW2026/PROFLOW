/**
 * Recipients are people who can act - not whoever opened the bell.
 * Named assignee/owner wins; otherwise permission holders, capped.
 */

export const NOTIFICATION_RECIPIENT_FANOUT_CAP = 8;

export function selectActorRecipients(input: {
  readonly holders?: readonly string[];
  readonly namedRecipientUserId?: string | null;
  readonly excludeUserIds?: readonly string[];
  readonly cap?: number;
}): string[] {
  const cap = input.cap ?? NOTIFICATION_RECIPIENT_FANOUT_CAP;
  const exclude = new Set((input.excludeUserIds ?? []).filter(Boolean));
  const named = input.namedRecipientUserId?.trim() || '';
  if (named && !exclude.has(named)) {
    return [named];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of input.holders ?? []) {
    const userId = id.trim();
    if (!userId || exclude.has(userId) || seen.has(userId)) continue;
    seen.add(userId);
    result.push(userId);
    if (result.length >= cap) break;
  }
  return result;
}
