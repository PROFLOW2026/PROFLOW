import 'server-only';

import { DomainRuleError } from '@/shared/errors';
import { SUMIT_TEST_API_BASE } from './sumit-http-client';

/** Milestone A/B: only SUMIT Test Configuration endpoint is permitted. */
export function normalizeSumitApiBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function isSumitTestProviderEndpoint(baseUrl: string): boolean {
  return normalizeSumitApiBaseUrl(baseUrl) === normalizeSumitApiBaseUrl(SUMIT_TEST_API_BASE);
}

/** Block SUMIT production provider URLs/credentials paths — not ProjectFlow deployment env. */
export function assertSumitTestProviderEndpoint(baseUrl: string): void {
  if (!isSumitTestProviderEndpoint(baseUrl)) {
    throw new DomainRuleError(
      'SUMIT production provider is not available in this release',
      'invoicingIntegration.errors.productionBlocked',
    );
  }
}
