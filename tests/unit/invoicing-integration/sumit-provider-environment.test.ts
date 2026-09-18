import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertSumitTestProviderEndpoint,
  isSumitTestProviderEndpoint,
} from '@/modules/invoicing-integration/providers/sumit/sumit-provider-environment';
import { SUMIT_TEST_API_BASE } from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';

describe('SUMIT provider environment guard', () => {
  it('allows the dedicated SUMIT test endpoint only', () => {
    expect(isSumitTestProviderEndpoint(SUMIT_TEST_API_BASE)).toBe(true);
    expect(isSumitTestProviderEndpoint(`${SUMIT_TEST_API_BASE}/`)).toBe(true);
    expect(() => assertSumitTestProviderEndpoint(SUMIT_TEST_API_BASE)).not.toThrow();
  });

  it('blocks non-test provider endpoints', () => {
    expect(isSumitTestProviderEndpoint('https://api.sumit.co.il.production.example')).toBe(false);
    expect(() => assertSumitTestProviderEndpoint('https://production.sumit.example')).toThrow(
      DomainRuleError,
    );
  });
});
