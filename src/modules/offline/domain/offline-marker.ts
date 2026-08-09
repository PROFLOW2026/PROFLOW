/**
 * Idempotency marker embedded in user-visible text fields so reconnect retries
 * do not create duplicate server rows when the first submit succeeded but the
 * client never received the response.
 */

const MARKER_PREFIX = '[pf-offline:';
const MARKER_SUFFIX = ']';

export function offlineMarker(localId: string): string {
  return `${MARKER_PREFIX}${localId}${MARKER_SUFFIX}`;
}

export function appendOfflineMarker(text: string | null | undefined, localId: string): string {
  const marker = offlineMarker(localId);
  const base = (text ?? '').trim();
  if (base.includes(marker)) return base.length > 0 ? base : marker;
  return base.length > 0 ? `${base}\n${marker}` : marker;
}

export function likePatternForOfflineMarker(localId: string): string {
  // localIds are UUIDs / opaque tokens without LIKE metacharacters in normal use.
  return `%${offlineMarker(localId)}%`;
}
