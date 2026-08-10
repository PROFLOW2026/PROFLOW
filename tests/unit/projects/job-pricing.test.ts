import { describe, expect, it } from 'vitest';
import {
  PRICE_NOT_SET_HE,
  canConvertJobToProject,
  isJobProfitDefined,
  isOpenPriceJob,
  jobListMissingProfitKind,
  resolveJobProfitDisplay,
} from '@/modules/projects/domain/job-pricing';
import {
  createJobSchema,
  setJobFixedPriceSchema,
} from '@/modules/projects/validation/schemas';
import { money } from '@/shared/money';

describe('job pricing — Scenario C (fixed 4500, costs 1800, margin 2700)', () => {
  it('defines profit as contract net minus actual cost', () => {
    const display = resolveJobProfitDisplay({
      workKind: 'job',
      pricingMode: 'fixed',
      currentContractNet: money('4500', 'ILS'),
      actualCost: money('1800', 'ILS'),
    });

    expect(display).toEqual({
      kind: 'defined',
      profit: money('2700', 'ILS'),
    });
    expect(
      isJobProfitDefined({
        workKind: 'job',
        pricingMode: 'fixed',
        currentContractNet: money('4500', 'ILS'),
      }),
    ).toBe(true);
  });
});

describe('job pricing — Scenario D (open then set price)', () => {
  it('does not invent a zero-revenue margin while open', () => {
    expect(
      isOpenPriceJob({ workKind: 'job', pricingMode: 'open' }),
    ).toBe(true);

    const openDisplay = resolveJobProfitDisplay({
      workKind: 'job',
      pricingMode: 'open',
      currentContractNet: null,
      actualCost: money('1800', 'ILS'),
    });
    expect(openDisplay).toEqual({ kind: 'price_not_set' });
    expect(PRICE_NOT_SET_HE).toBe('המחיר טרם נקבע');
  });

  it('list missing-profit placeholder: open → price not set; fixed → dash', () => {
    expect(jobListMissingProfitKind('open')).toBe('price_not_set');
    expect(jobListMissingProfitKind('fixed')).toBe('dash');
    expect(jobListMissingProfitKind(null)).toBe('dash');
  });

  it('after setting a fixed price, profit becomes defined', () => {
    const afterSet = resolveJobProfitDisplay({
      workKind: 'job',
      pricingMode: 'fixed',
      currentContractNet: money('4500', 'ILS'),
      actualCost: money('1800', 'ILS'),
    });
    expect(afterSet).toEqual({
      kind: 'defined',
      profit: money('2700', 'ILS'),
    });
  });

  it('blocks convert for open-price / missing managed revenue; allows fixed with contract', () => {
    expect(
      canConvertJobToProject({
        workKind: 'job',
        pricingMode: 'open',
        hasPrimaryContract: false,
        hasManagedOriginalNet: false,
        hasOriginalValueEvent: false,
      }),
    ).toBe(false);

    expect(
      canConvertJobToProject({
        workKind: 'job',
        pricingMode: 'fixed',
        hasPrimaryContract: false,
        hasManagedOriginalNet: false,
        hasOriginalValueEvent: false,
      }),
    ).toBe(false);

    expect(
      canConvertJobToProject({
        workKind: 'job',
        pricingMode: 'fixed',
        hasPrimaryContract: true,
        hasManagedOriginalNet: true,
        hasOriginalValueEvent: true,
      }),
    ).toBe(true);

    expect(
      canConvertJobToProject({
        workKind: 'job',
        pricingMode: 'fixed',
        hasPrimaryContract: true,
        hasManagedOriginalNet: false,
        hasOriginalValueEvent: true,
      }),
    ).toBe(true);
  });

  it('createJobSchema requires price for fixed and forbids amount for open', () => {
    const fixed = createJobSchema.safeParse({
      name: 'AC fix',
      clientName: 'Walk-in Dana',
      pricingMode: 'fixed',
      priceAmount: '4500',
      startDate: '2026-08-10',
    });
    expect(fixed.success).toBe(true);

    const openOk = createJobSchema.safeParse({
      name: 'AC fix',
      clientName: 'Walk-in Dana',
      pricingMode: 'open',
      startDate: '2026-08-10',
    });
    expect(openOk.success).toBe(true);

    const openWithPrice = createJobSchema.safeParse({
      name: 'AC fix',
      clientName: 'Walk-in Dana',
      pricingMode: 'open',
      priceAmount: '0',
      startDate: '2026-08-10',
    });
    expect(openWithPrice.success).toBe(false);

    const setPrice = setJobFixedPriceSchema.safeParse({
      jobId: '11111111-1111-4111-8111-111111111111',
      priceAmount: '4500',
    });
    expect(setPrice.success).toBe(true);
  });
});
