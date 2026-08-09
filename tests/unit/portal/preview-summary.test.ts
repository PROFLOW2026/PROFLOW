import { describe, expect, it } from 'vitest';
import { customerProjectSummarySchema } from '@/modules/portal/validation/schemas';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerSafeProjectSummary,
  grantCoversProject,
} from '@/modules/portal/domain/safe-project-summary';
import { CUSTOMER_PORTAL_NEVER_EXPOSED } from '@/modules/portal/domain/safe-project-summary';

describe('admin customer-safe preview inputs', () => {
  it('requires projectId and accepts optional grantId', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const grantId = '22222222-2222-4222-8222-222222222222';

    expect(customerProjectSummarySchema.safeParse({}).success).toBe(false);
    expect(customerProjectSummarySchema.safeParse({ projectId }).success).toBe(true);
    expect(
      customerProjectSummarySchema.safeParse({ projectId, grantId }).success,
    ).toBe(true);
  });

  it('preview projection stays customer-safe even when outstanding is supplied', () => {
    const summary = buildCustomerSafeProjectSummary({
      projectId: 'p1',
      name: 'Facade',
      status: 'active',
      progressPercent: '25',
      progressStatus: 'on_track',
      startDate: null,
      targetEndDate: null,
      location: null,
      description: null,
      clientName: 'Acme',
      outstanding: { amount: '900.00', currency: 'ILS' },
      scopes: ['project.summary'],
    });

    expect(summary).not.toHaveProperty('outstanding');
    expect(() =>
      assertNoSensitiveCustomerFields(summary as unknown as Record<string, unknown>),
    ).not.toThrow();
  });

  it('grant coverage rejects mismatched project+client before summary is shown', () => {
    expect(
      grantCoversProject(
        { projectId: 'other', clientId: 'c9' },
        { id: 'p1', clientId: 'c1' },
      ),
    ).toBe(false);
  });

  it('documents fields that customer portal must never expose', () => {
    expect(CUSTOMER_PORTAL_NEVER_EXPOSED).toEqual(
      expect.arrayContaining([
        'profit',
        'employeeCost',
        'overhead',
        'admin',
        'trueCost',
        'margin',
        'vendorConfidential',
        'audit',
      ]),
    );
  });
});

describe('cross-customer denial', () => {
  it('denies when grant project and client both miss the target project', () => {
    const covered = grantCoversProject(
      { projectId: 'project-a', clientId: 'client-a' },
      { id: 'project-b', clientId: 'client-b' },
    );
    expect(covered).toBe(false);
  });

  it('allows same-client grant across that client projects only', () => {
    expect(
      grantCoversProject(
        { projectId: null, clientId: 'client-a' },
        { id: 'project-b', clientId: 'client-a' },
      ),
    ).toBe(true);
    expect(
      grantCoversProject(
        { projectId: null, clientId: 'client-a' },
        { id: 'project-c', clientId: 'client-c' },
      ),
    ).toBe(false);
  });
});
