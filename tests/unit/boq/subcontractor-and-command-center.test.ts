import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { computeLineAmount } from '@/modules/boq/domain/amounts';
import {
  boqMeasurementAwaitingCopy,
  boqProgressReadyToBillCopy,
  boqVsContractMismatchCopy,
} from '@/modules/command-center/domain/item-copy';
import { SOURCE_DEFAULT_SEVERITY } from '@/modules/command-center/domain/ranking';

describe('boq subcontractor cost rates stay off client revenue math', () => {
  it('computes cost line amount independently of client unit price', () => {
    const clientRevenue = computeLineAmount({
      pricingType: 'quantity_unit_price',
      quantity: '10',
      unitPrice: money('100', 'ILS'),
    });
    const subCost = computeLineAmount({
      pricingType: 'quantity_unit_price',
      quantity: '10',
      unitPrice: money('40', 'ILS'),
    });
    expect(Number(clientRevenue.amount)).toBe(1000);
    expect(Number(subCost.amount)).toBe(400);
    expect(subCost.amount).not.toBe(clientRevenue.amount);
  });
});

describe('command center BOQ copy', () => {
  it('localizes measurement awaiting approval', () => {
    const he = boqMeasurementAwaitingCopy('he-IL', {
      periodLabel: 'מרץ',
      certificateNumber: 2,
    });
    expect(he.what).toContain('אישור');
    expect(he.why).toContain('2');

    const en = boqMeasurementAwaitingCopy('en', {
      periodLabel: 'March',
      certificateNumber: 2,
    });
    expect(en.what).toBe('Approve BOQ measurement');
  });

  it('localizes progress ready to bill', () => {
    const en = boqProgressReadyToBillCopy('en', {
      periodLabel: 'March',
      certificateNumber: 3,
    });
    expect(en.what).toContain('progress bill');
  });

  it('localizes contract mismatch', () => {
    const en = boqVsContractMismatchCopy('en', { status: 'variance' });
    expect(en.what).toContain('Reconcile');
    expect(en.why).toContain('variance');
  });

  it('registers default severities for BOQ sources', () => {
    expect(SOURCE_DEFAULT_SEVERITY.boq_measurement_awaiting_approval).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.boq_progress_ready_to_bill).toBe('high');
    expect(SOURCE_DEFAULT_SEVERITY.boq_vs_contract_mismatch).toBe('medium');
  });
});
