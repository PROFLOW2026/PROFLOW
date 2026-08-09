import type { SalesQuoteStatus, SalesQuoteVersionStatus } from './types';

/**
 * Sales quote versions mirror project-quote immutability patterns (doc 20 §7):
 * new versions supersede; accepted version sets the parent quote to accepted.
 */

export function isSalesQuoteVersionMutable(status: SalesQuoteVersionStatus): boolean {
  return status === 'draft';
}

export function canIssueSalesQuoteVersion(version: {
  status: SalesQuoteVersionStatus;
}): boolean {
  return version.status === 'draft';
}

export function canAcceptSalesQuoteVersion(version: {
  status: SalesQuoteVersionStatus;
}): boolean {
  return version.status === 'issued' || version.status === 'draft';
}

/** Statuses that a newer version should supersede when created or issued. */
export function shouldSupersedeOnNewVersion(status: SalesQuoteVersionStatus): boolean {
  return status === 'draft' || status === 'issued';
}

export function salesQuoteStatusAfterAccept(): SalesQuoteStatus {
  return 'accepted';
}

export function salesQuoteStatusAfterIssue(current: SalesQuoteStatus): SalesQuoteStatus {
  if (current === 'accepted' || current === 'rejected' || current === 'cancelled') {
    return current;
  }
  return 'issued';
}
