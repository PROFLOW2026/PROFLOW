import type { DrawingContractorVisibility, DrawingRevisionStatus } from './types';

/** Pure drawing-revision rules (mirrored by the `drawing_revisions_guard` trigger in 0162). */

export interface RevisionState {
  readonly id: string;
  readonly sequence: number;
  readonly status: DrawingRevisionStatus;
  readonly fileReady: boolean;
  readonly revisionLabel: string;
}

export function nextRevisionSequence(revisions: readonly Pick<RevisionState, 'sequence'>[]): number {
  return revisions.reduce((max, revision) => Math.max(max, revision.sequence), 0) + 1;
}

export type PublishRejection = 'not_found' | 'not_draft' | 'file_not_ready' | 'newer_published';

export type PublishPlan =
  | { readonly ok: true; readonly publishId: string; readonly supersedeId: string | null }
  | { readonly ok: false; readonly reason: PublishRejection };

/**
 * Publishing Rev N: N must be a draft with its file stored; the previous current revision (if any)
 * becomes superseded and stays as history. An older draft can never be published over a newer
 * published revision.
 */
export function planRevisionPublish(revisions: readonly RevisionState[], revisionId: string): PublishPlan {
  const target = revisions.find((revision) => revision.id === revisionId);
  if (!target) return { ok: false, reason: 'not_found' };
  if (target.status !== 'draft') return { ok: false, reason: 'not_draft' };
  if (!target.fileReady) return { ok: false, reason: 'file_not_ready' };
  const published = revisions.filter((revision) => revision.status === 'current' || revision.status === 'superseded');
  if (published.some((revision) => revision.sequence > target.sequence)) {
    return { ok: false, reason: 'newer_published' };
  }
  const current = revisions.find((revision) => revision.status === 'current') ?? null;
  return { ok: true, publishId: target.id, supersedeId: current?.id ?? null };
}

export function normalizeRevisionLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 16);
}

/** "3" -> "4", "C" -> "D", "P02" -> "P03"; otherwise empty (user types it). */
export function suggestNextRevisionLabel(latestLabel: string | null | undefined): string {
  const label = (latestLabel ?? '').trim();
  if (!label) return '0';
  const numeric = label.match(/^(.*?)(\d+)$/);
  if (numeric) {
    const [, prefix, digits] = numeric;
    const next = String(Number(digits) + 1).padStart(digits!.length, '0');
    return `${prefix}${next}`;
  }
  if (/^[A-Y]$/.test(label)) return String.fromCharCode(label.charCodeAt(0) + 1);
  if (/^[a-y]$/.test(label)) return String.fromCharCode(label.charCodeAt(0) + 1);
  return '';
}

export function isPublished(status: DrawingRevisionStatus): boolean {
  return status === 'current' || status === 'superseded';
}

/** Pure mirror of the `drawings_select` external branch. */
export function contractorCanSeeDrawing(input: {
  readonly status: 'active' | 'archived';
  readonly hasPublishedRevision: boolean;
  readonly visibility: DrawingContractorVisibility;
  readonly hasPlanViewOnProject: boolean;
  readonly distributedToContractor: boolean;
}): boolean {
  if (input.status !== 'active' || !input.hasPublishedRevision) return false;
  if (input.visibility === 'all_contractors') return input.hasPlanViewOnProject;
  if (input.visibility === 'distribution') return input.distributedToContractor;
  return false;
}

/** Acknowledgement is pending when the current revision requires it and this principal has not acknowledged. */
export function acknowledgementPending(input: {
  readonly revisionStatus: DrawingRevisionStatus;
  readonly acknowledgementRequired: boolean;
  readonly acknowledgedByMe: boolean;
}): boolean {
  return input.revisionStatus === 'current' && input.acknowledgementRequired && !input.acknowledgedByMe;
}
