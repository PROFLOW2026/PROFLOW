import type { IssuanceOutcome } from './types';

/** Provider retrieve statuses that mean the statutory document exists and was issued. */
const PROVIDER_ISSUED_STATUSES = new Set(['issued'] as const);

/**
 * After a successful provider status refresh, decide whether `issuanceOutcome` should change.
 * Returns `undefined` when the prior outcome must be preserved.
 */
export function resolveIssuanceOutcomeAfterProviderRefresh(input: {
  readonly previousOutcome: IssuanceOutcome | null;
  readonly providerStatus: string;
  readonly hasExternalId: boolean;
}): IssuanceOutcome | undefined {
  const { previousOutcome, providerStatus, hasExternalId } = input;

  if (!hasExternalId) {
    return undefined;
  }

  const providerIssued = PROVIDER_ISSUED_STATUSES.has(providerStatus as 'issued');

  if (providerIssued) {
    if (previousOutcome === 'ambiguous' || previousOutcome === 'in_flight') {
      return 'confirmed_created';
    }
    return undefined;
  }

  if (providerStatus === 'failed' || providerStatus === 'cancelled') {
    if (previousOutcome === 'ambiguous' || previousOutcome === 'in_flight') {
      return 'confirmed_rejected';
    }
  }

  return undefined;
}
