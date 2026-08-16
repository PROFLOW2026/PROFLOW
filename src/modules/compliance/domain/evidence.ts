/**
 * Document evidence helpers for compliance artifacts (doc 24).
 * "Missing" is a UI/evidence concept - not a new DB status (no schema change).
 * Notifications are explicitly out of scope (doc 26 deferred).
 */

import type { ArtifactStatus } from './types';

/** Primary UI buckets for list filters / summary chips. */
export const COMPLIANCE_UI_BUCKETS = [
  'valid',
  'expiring_soon',
  'expired',
  'missing',
] as const;

export type ComplianceUiBucket = (typeof COMPLIANCE_UI_BUCKETS)[number];

export function hasDocumentEvidence(artifact: {
  readonly documentId: string | null;
}): boolean {
  return Boolean(artifact.documentId);
}

/**
 * Missing evidence: no attached document, and not revoked.
 * Pending without a document is always missing; auto statuses without docs also flag missing.
 */
export function isMissingEvidence(artifact: {
  readonly documentId: string | null;
  readonly status: ArtifactStatus;
}): boolean {
  if (artifact.status === 'revoked') return false;
  return !hasDocumentEvidence(artifact);
}

/**
 * Maps resolved expiry status + evidence into the four primary UI buckets.
 * Revoked stays out of the primary four (filter via stored status).
 */
export function resolveComplianceUiBucket(artifact: {
  readonly documentId: string | null;
  readonly status: ArtifactStatus;
}): ComplianceUiBucket | 'revoked' | 'pending' {
  if (artifact.status === 'revoked') return 'revoked';
  if (isMissingEvidence(artifact) || artifact.status === 'pending') {
    return 'missing';
  }
  if (artifact.status === 'expired') return 'expired';
  if (artifact.status === 'expiring_soon') return 'expiring_soon';
  return 'valid';
}
