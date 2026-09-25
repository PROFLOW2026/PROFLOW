import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertAllowedSumitApiBase,
  assertSumitTestProviderEndpoint,
  isAllowedSumitApiBase,
  isSumitTestProviderEndpoint,
} from '@/modules/invoicing-integration/providers/sumit/sumit-provider-environment';
import {
  SUMIT_API_BASE,
  SUMIT_TEST_API_BASE,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';

describe('SUMIT provider environment guard', () => {
  it('allows only the live SUMIT host https://api.sumit.co.il', () => {
    expect(SUMIT_API_BASE).toBe('https://api.sumit.co.il');
    expect(SUMIT_TEST_API_BASE).toBe(SUMIT_API_BASE);
    expect(isAllowedSumitApiBase(SUMIT_API_BASE)).toBe(true);
    expect(isAllowedSumitApiBase(`${SUMIT_API_BASE}/`)).toBe(true);
    expect(isSumitTestProviderEndpoint(SUMIT_API_BASE)).toBe(true);
    expect(() => assertAllowedSumitApiBase(SUMIT_API_BASE)).not.toThrow();
    expect(() => assertSumitTestProviderEndpoint(SUMIT_API_BASE)).not.toThrow();
  });

  it('rejects every other base URL', () => {
    expect(isAllowedSumitApiBase('https://api.sumit.co.il.example')).toBe(false);
    expect(isAllowedSumitApiBase('https://sandbox.sumit.co.il')).toBe(false);
    expect(() => assertAllowedSumitApiBase('https://example.test')).toThrow(DomainRuleError);
  });
});
