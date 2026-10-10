import { describe, expect, it } from 'vitest';
import { certifiedCashFlowProvider } from '@/modules/contractor-portal/application/providers/cash-flow';
import { PORTAL_SECTION_PROVIDERS } from '@/modules/contractor-portal/application/registry';

describe('contractor portal cash flow provider', () => {
  it('registers FINANCE certified receipt forecast provider', () => {
    expect(PORTAL_SECTION_PROVIDERS.some((provider) => provider.id === certifiedCashFlowProvider.id)).toBe(
      true,
    );
    expect(certifiedCashFlowProvider.section).toBe('cashFlowForecast');
  });
});
