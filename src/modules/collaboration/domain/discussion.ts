import { DomainRuleError } from '@/shared/errors';
import type { EntityScope } from '@/shared/entity-access/types';

/**
 * Contextual discussion rules (pure). Threads attach to any entity registered in
 * `@/shared/entity-access`. Audience:
 *   internal   - organization users only; NEVER returned to an external principal
 *   contractor - organization users + contractors scoped to the entity's vendor (or, for a
 *                vendor-less shared project entity, contractors that can see the entity)
 * Decisions are internal-authored formal records (kind = 'decision'), audited, append-only.
 */

export type DiscussionAudience = 'internal' | 'contractor';
export type DiscussionKind = 'comment' | 'decision';

export const COMMENT_MAX_LENGTH = 8000;

export function normaliseCommentBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new DomainRuleError('Comment is empty', 'collaboration.errors.commentEmpty');
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new DomainRuleError('Comment is too long', 'collaboration.errors.commentTooLong');
  }
  return trimmed;
}

export function isDiscussionAudience(value: unknown): value is DiscussionAudience {
  return value === 'internal' || value === 'contractor';
}

/** Internal post: contractor audience is impossible on internal-only entities. */
export function assertInternalAudienceAllowed(scope: EntityScope, audience: DiscussionAudience): void {
  if (audience === 'contractor' && scope.internalOnly) {
    throw new DomainRuleError(
      'This item is not shared with contractors',
      'collaboration.errors.notSharedWithContractors',
    );
  }
}

/**
 * Vendor recorded on an external post: the entity's vendor when it has one (must be one the principal
 * acts for), otherwise the vendor of the grant the principal uses on this project.
 */
export function resolveExternalPostVendor(
  scope: EntityScope,
  principalVendorIds: readonly string[],
): string | null {
  if (scope.internalOnly) return null;
  if (scope.vendorId) return principalVendorIds.includes(scope.vendorId) ? scope.vendorId : null;
  return principalVendorIds[0] ?? null;
}

export interface DiscussionPostRecord {
  readonly audience: DiscussionAudience;
  readonly vendorId: string | null;
  readonly actorType: 'internal' | 'external' | 'system';
  readonly actorPrincipalId: string | null;
}

/**
 * Application-level mirror of the RLS rule (defense in depth; the repository also filters in SQL).
 * External viewers see contractor posts that are vendor-less (shared entity) or of their own vendor.
 */
export function externalCanSeePost(post: DiscussionPostRecord, viewerVendorIds: readonly string[]): boolean {
  if (post.audience !== 'contractor') return false;
  if (post.vendorId === null) return true;
  return viewerVendorIds.includes(post.vendorId);
}
