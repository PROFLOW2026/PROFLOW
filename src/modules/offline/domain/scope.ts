import type { DraftScope, OfflineDraftRecord } from './types';

export class OfflineScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineScopeError';
  }
}

export function assertValidScope(scope: DraftScope): void {
  if (!scope.organizationId.trim()) {
    throw new OfflineScopeError('Offline draft organizationId is required.');
  }
  if (!scope.userId.trim()) {
    throw new OfflineScopeError('Offline draft userId is required.');
  }
}

/** True when the draft belongs to the active tenant + user. */
export function matchesDraftScope(
  draft: Pick<OfflineDraftRecord, 'organizationId' | 'userId'>,
  scope: DraftScope,
): boolean {
  if (draft.organizationId !== scope.organizationId) return false;
  // Legacy pre-hardening rows may lack userId; treat empty as unmatched until claimed.
  if (!draft.userId) return false;
  return draft.userId === scope.userId;
}

/**
 * Reject cross-tenant or cross-user sync attempts. Call before submit.
 */
export function assertDraftMatchesScope(
  draft: Pick<OfflineDraftRecord, 'organizationId' | 'userId' | 'localId'>,
  scope: DraftScope,
): void {
  assertValidScope(scope);
  if (!matchesDraftScope(draft, scope)) {
    throw new OfflineScopeError(
      `Offline draft ${draft.localId} is outside the active organization/user scope.`,
    );
  }
}

/** Whether a local row is eligible to be claimed by the current user (legacy). */
export function isUnscopedDraft(
  draft: Pick<OfflineDraftRecord, 'organizationId' | 'userId'>,
  organizationId: string,
): boolean {
  return draft.organizationId === organizationId && !draft.userId.trim();
}
