import type { QuoteVersionRecord, QuoteVersionStatus } from './types';

/**
 * Quote versions are immutable once issued (doc 05 §4).
 * Negotiation history stays readable: new versions supersede, never delete.
 */

export function isQuoteVersionMutable(status: QuoteVersionStatus): boolean {
  return status === 'draft';
}

export function assertQuoteVersionMutable(version: Pick<QuoteVersionRecord, 'status'>): void {
  if (!isQuoteVersionMutable(version.status)) {
    throw new Error(`Quote version in status "${version.status}" cannot be modified`);
  }
}

export function canIssueQuoteVersion(version: Pick<QuoteVersionRecord, 'status'>): boolean {
  return version.status === 'draft';
}

export function isIssuedQuoteVersion(version: Pick<QuoteVersionRecord, 'status'>): boolean {
  return version.status === 'issued' || version.status === 'accepted';
}
