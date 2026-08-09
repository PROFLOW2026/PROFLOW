import { describe, expect, it } from 'vitest';
import {
  buildCustomerSafeProjectSummary,
  grantCoversProject,
  grantIsActive,
  normalizeCustomerScopes,
} from '@/modules/portal/domain/safe-project-summary';

describe('customer portal scopes', () => {
  it('keeps only known customer scopes', () => {
    expect(normalizeCustomerScopes(['project.summary', 'cost.read', 'billing.outstanding'])).toEqual([
      'project.summary',
      'billing.outstanding',
    ]);
  });
});

describe('grant coverage', () => {
  it('matches project id or shared client', () => {
    expect(
      grantCoversProject({ projectId: 'p1', clientId: null }, { id: 'p1', clientId: 'c1' }),
    ).toBe(true);
    expect(
      grantCoversProject({ projectId: null, clientId: 'c1' }, { id: 'p2', clientId: 'c1' }),
    ).toBe(true);
    expect(
      grantCoversProject({ projectId: 'p9', clientId: 'c9' }, { id: 'p1', clientId: 'c1' }),
    ).toBe(false);
  });

  it('treats expired grants as inactive', () => {
    expect(
      grantIsActive({
        status: 'active',
        revokedAt: null,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).toBe(false);
  });
});

describe('customer-safe project summary', () => {
  it('never includes cost or profit fields and gates outstanding by scope', () => {
    const withoutBilling = buildCustomerSafeProjectSummary({
      projectId: 'p1',
      name: 'Site A',
      status: 'active',
      progressPercent: '40',
      progressStatus: 'on_track',
      startDate: '2026-01-01',
      targetEndDate: '2026-12-01',
      location: 'Tel Aviv',
      description: 'Facade',
      clientName: 'Acme',
      outstanding: { amount: '1000.00', currency: 'ILS' },
      scopes: ['project.summary'],
    });

    expect(withoutBilling).toEqual({
      projectId: 'p1',
      name: 'Site A',
      status: 'active',
      progressPercent: '40',
      progressStatus: 'on_track',
      startDate: '2026-01-01',
      targetEndDate: '2026-12-01',
      location: 'Tel Aviv',
      description: 'Facade',
      clientName: 'Acme',
    });
    expect(withoutBilling).not.toHaveProperty('outstanding');
    expect(withoutBilling).not.toHaveProperty('cost');
    expect(withoutBilling).not.toHaveProperty('profit');

    const withBilling = buildCustomerSafeProjectSummary({
      ...withoutBilling,
      outstanding: { amount: '1000.00', currency: 'ILS' },
      scopes: ['project.summary', 'billing.outstanding'],
    });
    expect(withBilling.outstanding).toEqual({ amount: '1000.00', currency: 'ILS' });
  });
});
