import { describe, expect, it } from 'vitest';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerSafeProjectSummary,
} from '@/modules/portal/domain/safe-project-summary';

describe('customer-safe project summary', () => {
  it('omits outstanding unless scoped', () => {
    const base = {
      projectId: 'p1',
      name: 'Tower',
      status: 'active',
      progressPercent: '40',
      progressStatus: 'on_track',
      startDate: '2026-01-01',
      targetEndDate: '2026-12-01',
      location: 'TLV',
      description: 'Demo',
      clientName: 'Acme',
      outstanding: { amount: '500', currency: 'ILS' },
      scopes: ['project.summary'] as const,
    };

    expect(buildCustomerSafeProjectSummary(base).outstanding).toBeUndefined();
    expect(
      buildCustomerSafeProjectSummary({
        ...base,
        scopes: ['project.summary', 'billing.outstanding'],
      }).outstanding,
    ).toEqual({ amount: '500', currency: 'ILS' });
  });

  it('rejects sensitive field leakage', () => {
    expect(() => assertNoSensitiveCustomerFields({ profit: '1' })).toThrow(/sensitive/i);
    expect(() => assertNoSensitiveCustomerFields({ name: 'ok' })).not.toThrow();
  });
});
