import type { EvidenceVisibility } from './types';

/**
 * Who may see an uploaded item.
 *  - Contractor uploads are always contractor-visible (the contractor must see what it sent).
 *  - An internal-only entity never exposes evidence to contractors.
 *  - Otherwise internal uploaders choose; the default is `internal` unless the caller passes one.
 */
export function resolveEvidenceVisibility(input: {
  readonly uploader: 'internal' | 'external';
  readonly requested?: EvidenceVisibility | null;
  readonly entityInternalOnly: boolean;
}): { ok: true; visibility: EvidenceVisibility } | { ok: false; reason: 'internal_only_entity' } {
  if (input.uploader === 'external') {
    if (input.entityInternalOnly) return { ok: false, reason: 'internal_only_entity' };
    return { ok: true, visibility: 'contractor' };
  }
  if (input.entityInternalOnly) {
    if (input.requested === 'contractor') return { ok: false, reason: 'internal_only_entity' };
    return { ok: true, visibility: 'internal' };
  }
  return { ok: true, visibility: input.requested ?? 'internal' };
}

const MAX_CAPTION = 500;

export function normalizeCaption(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!value) return null;
  return value.length > MAX_CAPTION ? value.slice(0, MAX_CAPTION) : value;
}
