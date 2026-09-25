import 'server-only';

import { DomainRuleError } from '@/shared/errors';
import { SUMIT_API_BASE } from './sumit-http-client';

/** Strip a trailing slash so host comparison is exact. */
export function normalizeSumitApiBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/** True only for the live SUMIT host https://api.sumit.co.il. */
export function isAllowedSumitApiBase(baseUrl: string): boolean {
  return normalizeSumitApiBaseUrl(baseUrl) === normalizeSumitApiBaseUrl(SUMIT_API_BASE);
}

/** Reject every host other than the live SUMIT API. */
export function assertAllowedSumitApiBase(baseUrl: string): void {
  if (!isAllowedSumitApiBase(baseUrl)) {
    throw new DomainRuleError(
      'Only the SUMIT API at https://api.sumit.co.il is allowed',
      'invoicingIntegration.errors.productionBlocked',
    );
  }
}

/** @deprecated Use isAllowedSumitApiBase. The allowed host is the live API. */
export const isSumitTestProviderEndpoint = isAllowedSumitApiBase;

/** @deprecated Use assertAllowedSumitApiBase. */
export const assertSumitTestProviderEndpoint = assertAllowedSumitApiBase;
