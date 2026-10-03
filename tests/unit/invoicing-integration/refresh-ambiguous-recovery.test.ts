import { describe, expect, it } from 'vitest';
import { resolveIssuanceOutcomeAfterProviderRefresh } from '@/modules/invoicing-integration/domain/resolve-issuance-outcome-after-refresh';

describe('resolveIssuanceOutcomeAfterProviderRefresh', () => {
  it('ambiguous + provider issued → confirmed_created', () => {
    expect(
      resolveIssuanceOutcomeAfterProviderRefresh({
        previousOutcome: 'ambiguous',
        providerStatus: 'issued',
        hasExternalId: true,
      }),
    ).toBe('confirmed_created');
  });

  it('ambiguous + provider pending → stays ambiguous (undefined patch)', () => {
    expect(
      resolveIssuanceOutcomeAfterProviderRefresh({
        previousOutcome: 'ambiguous',
        providerStatus: 'pending',
        hasExternalId: true,
      }),
    ).toBeUndefined();
  });

  it('ambiguous + provider failed → confirmed_rejected', () => {
    expect(
      resolveIssuanceOutcomeAfterProviderRefresh({
        previousOutcome: 'ambiguous',
        providerStatus: 'failed',
        hasExternalId: true,
      }),
    ).toBe('confirmed_rejected');
  });

  it('confirmed_created unchanged when already issued', () => {
    expect(
      resolveIssuanceOutcomeAfterProviderRefresh({
        previousOutcome: 'confirmed_created',
        providerStatus: 'issued',
        hasExternalId: true,
      }),
    ).toBeUndefined();
  });
});
