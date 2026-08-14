import type { DocumentOwnerType } from '@/modules/documents/domain/types';
import type { DraftKind } from './types';

/** Product creates first so capture drafts can inherit the new owner id. */
export function compareDraftsForSync(
  a: { readonly kind: DraftKind; readonly updatedAt: string },
  b: { readonly kind: DraftKind; readonly updatedAt: string },
): number {
  const rank = (kind: DraftKind) => (kind === 'capture' ? 1 : 0);
  const byKind = rank(a.kind) - rank(b.kind);
  if (byKind !== 0) return byKind;
  return a.updatedAt.localeCompare(b.updatedAt);
}

export function captureOwnerTypeForProductKind(
  kind: Exclude<DraftKind, 'capture'>,
): DocumentOwnerType | null {
  switch (kind) {
    case 'daily_log':
      return 'daily_log';
    case 'punch':
      return 'punch_list_item';
    case 'inspection':
      return 'inspection';
    default:
      return null;
  }
}

export function ownerIdFromCapturePayload(
  payload: Record<string, unknown>,
  parentServerId: string | null | undefined,
): string | null {
  const direct = typeof payload.ownerId === 'string' ? payload.ownerId.trim() : '';
  if (direct) return direct;
  const parent = parentServerId?.trim() ?? '';
  return parent || null;
}

export function pendingOwnerDraftLocalIdFromPayload(
  payload: Record<string, unknown>,
): string | null {
  const value = payload.pendingOwnerDraftLocalId;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}
