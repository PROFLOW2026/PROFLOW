/** Token format stored in comment bodies: `@[orgMembershipId]` */

const MENTION_TOKEN = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]/gi;

export function extractMentionOrgMemberIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

export function formatMentionToken(orgMemberId: string): string {
  return `@[${orgMemberId}]`;
}

export function stripMentionTokensForPreview(body: string): string {
  return body.replace(MENTION_TOKEN, '@').replace(/\s+/g, ' ').trim();
}

export type CommentBodySegment =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'mention'; readonly orgMemberId: string; readonly label: string };

/** Splits stored comment text into plain text and @mention segments for display. */
export function segmentCommentBody(
  body: string,
  labelByOrgMemberId: Readonly<Record<string, string>> = {},
): CommentBodySegment[] {
  if (!body) return [];

  const segments: CommentBodySegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MENTION_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: body.slice(lastIndex, index) });
    }
    const orgMemberId = match[1]!;
    segments.push({
      type: 'mention',
      orgMemberId,
      label: labelByOrgMemberId[orgMemberId]?.trim() || '@',
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) });
  }

  return segments;
}
