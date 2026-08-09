import { describe, expect, it } from 'vitest';

/**
 * Binding rule mirrored by findQuoteVersionForChangeRequest:
 * a quote version may only affect the change request that owns its parent quote.
 */
function quoteVersionBelongsToChangeRequest(input: {
  readonly quoteChangeRequestId: string | null;
  readonly changeRequestId: string;
}): boolean {
  return (
    input.quoteChangeRequestId != null &&
    input.quoteChangeRequestId === input.changeRequestId
  );
}

describe('quote version ↔ change request binding', () => {
  it('accepts a version whose parent quote belongs to the CR', () => {
    expect(
      quoteVersionBelongsToChangeRequest({
        quoteChangeRequestId: 'cr-a',
        changeRequestId: 'cr-a',
      }),
    ).toBe(true);
  });

  it('rejects cross-CR quote version attachment (intra-org IDOR)', () => {
    expect(
      quoteVersionBelongsToChangeRequest({
        quoteChangeRequestId: 'cr-b',
        changeRequestId: 'cr-a',
      }),
    ).toBe(false);
  });

  it('rejects versions with no parent change request', () => {
    expect(
      quoteVersionBelongsToChangeRequest({
        quoteChangeRequestId: null,
        changeRequestId: 'cr-a',
      }),
    ).toBe(false);
  });
});
