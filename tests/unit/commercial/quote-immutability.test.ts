import { describe, expect, it } from 'vitest';
import { assertQuoteVersionMutable } from '@/modules/commercial/domain/quote-version-rules';

describe('application-layer quote immutability guard', () => {
  it('rejects mutation of issued versions at the domain boundary used by use cases', () => {
    expect(() => assertQuoteVersionMutable({ status: 'issued' })).toThrow();
    expect(() => assertQuoteVersionMutable({ status: 'superseded' })).toThrow();
    expect(() => assertQuoteVersionMutable({ status: 'draft' })).not.toThrow();
  });
});
