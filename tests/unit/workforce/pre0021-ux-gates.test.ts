import { afterEach, describe, expect, it } from 'vitest';
import { deriveKnownEmployerCost } from '@/modules/workforce/domain/monthly-allocation';
import {
  EMPLOYEE_MONTH_COSTS_READY,
  areEmployeeMonthCostsAvailable,
  previewMonthlyCostStrip,
  resolveKnownEmployerCostFields,
  setEmployeeMonthCostsReadyForTests,
} from '@/modules/workforce/domain/monthly-cost-gates';
import {
  AP_BILL_PROJECT_ALLOCATIONS_READY,
  areApBillProjectAllocationsAvailable,
  setApBillProjectAllocationsReadyForTests,
} from '@/modules/ap/domain/vendor-bill-project-attribution';

describe('Post-0021 feature gates', () => {
  afterEach(() => {
    setEmployeeMonthCostsReadyForTests(undefined);
    setApBillProjectAllocationsReadyForTests(undefined);
  });

  it('enables monthly employer-cost persistence after displacement wiring', () => {
    expect(EMPLOYEE_MONTH_COSTS_READY).toBe(true);
    expect(areEmployeeMonthCostsAvailable()).toBe(true);
  });

  it('enables vendor bill allocation persistence after rollup wiring', () => {
    expect(AP_BILL_PROJECT_ALLOCATIONS_READY).toBe(true);
    expect(areApBillProjectAllocationsAvailable()).toBe(true);
  });

  it('allows test-only overrides to force gates off without mutating production constants', () => {
    setEmployeeMonthCostsReadyForTests(false);
    setApBillProjectAllocationsReadyForTests(false);
    expect(EMPLOYEE_MONTH_COSTS_READY).toBe(true);
    expect(AP_BILL_PROJECT_ALLOCATIONS_READY).toBe(true);
    expect(areEmployeeMonthCostsAvailable()).toBe(false);
    expect(areApBillProjectAllocationsAvailable()).toBe(false);
  });

  it('previewMonthlyCostStrip conserves known = allocated + unallocated', () => {
    const preview = previewMonthlyCostStrip({
      estimatedAmount: '10000',
      actualAmount: '',
      allocatedAmount: '6000',
    });
    expect(preview.knownQuality).toBe('estimated');
    expect(preview.knownAmount).toBe('10000.00');
    expect(preview.allocatedAmount).toBe('6000.00');
    expect(preview.unallocatedAmount).toBe('4000.00');
    expect(preview.status).toBe('partial');
  });

  it('prefers actual employer cost over estimated when present', () => {
    const preview = previewMonthlyCostStrip({
      estimatedAmount: '10000',
      actualAmount: '12000',
      allocatedAmount: '12000',
    });
    expect(preview.knownQuality).toBe('actual');
    expect(preview.status).toBe('balanced');
    expect(preview.unallocatedAmount).toBe('0.00');
  });

  it('resolveKnownEmployerCostFields trims whitespace and ignores zero actual', () => {
    expect(
      resolveKnownEmployerCostFields({ estimatedAmount: '10000', actualAmount: '   ' }).knownQuality,
    ).toBe('estimated');
    expect(
      resolveKnownEmployerCostFields({ estimatedAmount: '10000', actualAmount: '0' }).knownQuality,
    ).toBe('estimated');
    expect(
      resolveKnownEmployerCostFields({ estimatedAmount: '10000', actualAmount: ' 12000 ' }),
    ).toMatchObject({ knownQuality: 'actual', knownNumeric: 12000 });
  });

  it('previewMonthlyCostStrip matches deriveKnownEmployerCost known amount and quality', () => {
    const cases = [
      { estimated: '10000', actual: '' },
      { estimated: '10000', actual: '12000' },
      { estimated: '10000', actual: '0' },
      { estimated: '10000', actual: '   ' },
    ] as const;
    for (const sample of cases) {
      const preview = previewMonthlyCostStrip({
        estimatedAmount: sample.estimated,
        actualAmount: sample.actual,
        allocatedAmount: '0',
      });
      const derived = deriveKnownEmployerCost({
        estimatedAmount: sample.estimated,
        actualAmount: sample.actual,
        currency: 'ILS',
      });
      expect(preview.knownQuality).toBe(derived.knownQuality);
      expect(preview.knownAmount).toBe(Number(derived.knownAmount.amount).toFixed(2));
    }
  });

  it('flags over-allocation without hiding remainder math', () => {
    const preview = previewMonthlyCostStrip({
      estimatedAmount: '1000',
      actualAmount: '',
      allocatedAmount: '1500',
    });
    expect(preview.status).toBe('over');
    expect(preview.unallocatedAmount).toBe('0.00');
  });
});
