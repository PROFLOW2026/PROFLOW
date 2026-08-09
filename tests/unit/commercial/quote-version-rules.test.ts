import { describe, expect, it } from 'vitest';
import {
  assertQuoteVersionMutable,
  canIssueQuoteVersion,
  isQuoteVersionMutable,
} from '@/modules/commercial/domain/quote-version-rules';

describe('quote version immutability', () => {
  it('allows edits only in draft status', () => {
    expect(isQuoteVersionMutable('draft')).toBe(true);
    expect(isQuoteVersionMutable('issued')).toBe(false);
    expect(isQuoteVersionMutable('superseded')).toBe(false);
    expect(isQuoteVersionMutable('accepted')).toBe(false);
  });

  it('throws when attempting to mutate an issued version', () => {
    expect(() => assertQuoteVersionMutable({ status: 'issued' })).toThrow(/immutable|cannot be modified/i);
  });

  it('allows issuing only from draft', () => {
    expect(canIssueQuoteVersion({ status: 'draft' })).toBe(true);
    expect(canIssueQuoteVersion({ status: 'issued' })).toBe(false);
  });
});
