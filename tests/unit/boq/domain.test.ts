import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  assertQuantityReductionSafe,
  assertWithinCurrentQuantity,
  computeLineAmount,
  percentComplete,
  recomputeCurrentFromOriginal,
} from '@/modules/boq/domain/amounts';
import { reconcileContractBoq } from '@/modules/boq/domain/reconciliation';
import { buildProgressCertificate } from '@/modules/boq/domain/progress-certificate';
import { canCreateProgressBilling, canEditBoqBaseline } from '@/modules/boq/domain/lifecycle';

describe('boq amounts', () => {
  it('computes quantity × unit price with decimal safety', () => {
    const amount = computeLineAmount({
      pricingType: 'quantity_unit_price',
      quantity: '0.1',
      unitPrice: money('320', 'ILS'),
    });
    expect(amount.amount).toBe('32.000000');
  });

  it('keeps original and applies approved deltas to current', () => {
    const current = recomputeCurrentFromOriginal({
      pricingType: 'quantity_unit_price',
      originalQuantity: '250',
      originalUnitPrice: money('320', 'ILS'),
      quantityDelta: '20',
      unitPriceDelta: money('0', 'ILS'),
    });
    expect(current.currentQuantity).toBe('270');
    expect(current.currentAmount.amount).toBe('86400.000000');
  });

  it('blocks over-measurement against current quantity', () => {
    expect(() =>
      assertWithinCurrentQuantity({
        currentQuantity: '250',
        cumulativeApprovedAfter: '270',
      }),
    ).toThrow(/Over-measurement/);
  });

  it('blocks reducing current below billed/approved', () => {
    expect(() =>
      assertQuantityReductionSafe({
        newCurrentQuantity: '80',
        cumulativeApprovedOrBilled: '90',
      }),
    ).toThrow(/Cannot reduce/);
  });

  it('computes percent complete', () => {
    expect(percentComplete({ cumulativeApproved: '130', currentQuantity: '250' })).toBe('52');
  });
});

describe('boq reconciliation', () => {
  it('flags unallocated contract value explicitly', () => {
    const result = reconcileContractBoq({
      originalContract: money('1000000', 'ILS'),
      originalBoq: money('1000000', 'ILS'),
      currentContract: money('1040000', 'ILS'),
      currentBoq: money('1025000', 'ILS'),
      approvedChanges: money('40000', 'ILS'),
      allocatedApprovedChanges: money('25000', 'ILS'),
    });
    expect(result.status).toBe('unallocated_approved_change');
    expect(result.unallocatedApprovedChanges.amount).toBe('15000.000000');
  });
});

describe('progress certificate', () => {
  it('builds previous / current / cumulative values', () => {
    const cert = buildProgressCertificate({
      currency: 'ILS',
      lines: [
        {
          boqNodeId: '11111111-1111-1111-1111-111111111111',
          itemCode: '01.01',
          description: 'Electrical point',
          pricingType: 'quantity_unit_price',
          contractQuantity: '250',
          previousQuantity: '80',
          currentPeriodApproved: '50',
          unitPrice: money('320', 'ILS'),
        },
      ],
    });
    expect(cert.lines[0]?.currentValue.amount).toBe('16000.000000');
    expect(cert.lines[0]?.cumulativeQuantity).toBe('130');
    expect(cert.currentPeriodValue.amount).toBe('16000.000000');
  });
});

describe('lifecycle', () => {
  it('only drafts are editable baselines', () => {
    expect(canEditBoqBaseline('draft')).toBe(true);
    expect(canEditBoqBaseline('active')).toBe(false);
  });

  it('billing only from approved batches', () => {
    expect(canCreateProgressBilling('approved')).toBe(true);
    expect(canCreateProgressBilling('draft')).toBe(false);
    expect(canCreateProgressBilling('billed')).toBe(false);
  });
});
