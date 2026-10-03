import { describe, expect, it } from 'vitest';
import * as schema from '@drizzle/schema';
import {
  agreementActionTarget,
  assertAgreementAcceptsChanges,
  assertAgreementAction,
  assertAgreementClosable,
  assertBaselineEditable,
  assertChangeAction,
  assertUnpricedWorkAction,
  availableAgreementActions,
  canApplyChangeAction,
} from '@/modules/subcontracts/domain/lifecycle';
import * as domain from '@/modules/subcontracts/domain/types';
import {
  addDaysToBusinessDate,
  approvedContractValue,
  assertChangeAmountSign,
  assertWeightedLinesComplete,
  computeLineContractAmount,
  revisedLineValue,
  versionTotal,
} from '@/modules/subcontracts/domain/value';
import { money } from '@/shared/money';

describe('approvedContractValue', () => {
  it('uses the draft amount until the original event exists and ignores unknown kinds', () => {
    expect(
      approvedContractValue({ currency: 'ils', draftOriginalAmount: '1000', events: [] }),
    ).toMatchObject({ original: { amount: '1000.000000' }, approvedChanges: { amount: '0.000000' }, current: { amount: '1000.000000' } });
    const value = approvedContractValue({
      currency: 'ILS',
      draftOriginalAmount: '999',
      events: [
        { kind: 'original', amount: '1500', currency: 'ILS' },
        { kind: 'change_order', amount: '600', currency: 'ILS' },
        { kind: 'adjustment', amount: '-100', currency: 'ILS' },
        { kind: 'proposal', amount: '5000', currency: 'ILS' },
      ],
    });
    expect([value.original.amount, value.approvedChanges.amount, value.current.amount]).toEqual([
      '1500.000000',
      '500.000000',
      '2000.000000',
    ]);
  });
});

describe('revisedLineValue', () => {
  it('adds approved adjustments to the baseline', () => {
    const value = revisedLineValue({
      currency: 'ILS',
      isBaseline: true,
      baselineAmount: '500',
      baselineQuantity: '10',
      adjustments: [
        { quantityDelta: '5', amountDelta: '300' },
        { quantityDelta: '-2', amountDelta: '-100' },
      ],
    });
    expect([value.contractBaseline.amount, value.approvedChanges.amount, value.revised.amount]).toEqual([
      '500.000000',
      '200.000000',
      '700.000000',
    ]);
    expect([value.baselineQuantity, value.revisedQuantity]).toEqual(['10.000000', '13.000000']);
  });

  it('reports change-created lines entirely as approved changes', () => {
    const value = revisedLineValue({
      currency: 'ILS',
      isBaseline: false,
      baselineAmount: '300',
      baselineQuantity: '1',
      adjustments: [],
    });
    expect([value.contractBaseline.amount, value.approvedChanges.amount, value.revised.amount, value.baselineQuantity]).toEqual([
      '0.000000',
      '300.000000',
      '300.000000',
      '0.000000',
    ]);
  });
});

describe('line amounts and change versions', () => {
  it('prices quantity x rate lines and uses the entered amount for the other types', () => {
    expect(
      computeLineContractAmount({ currency: 'ILS', lineType: 'quantity_rate', quantity: '12.5', unitPrice: '40' }).amount,
    ).toBe('500.000000');
    expect(
      computeLineContractAmount({ currency: 'ILS', lineType: 'lump_sum', quantity: '1', unitPrice: '0', contractAmount: '900' })
        .amount,
    ).toBe('900.000000');
  });

  it('derives the version total from its lines when lines exist', () => {
    expect(
      versionTotal({
        currency: 'ILS',
        amount: '1',
        lines: [
          { quantityDelta: '5', unitRate: '60', amountDelta: null },
          { quantityDelta: '0', unitRate: null, amountDelta: '300' },
        ],
      }).amount,
    ).toBe('600.000000');
    expect(versionTotal({ currency: 'ILS', amount: '-250', lines: [] }).amount).toBe('-250.000000');
  });

  it('enforces the sign of additions and deductions', () => {
    expect(() => assertChangeAmountSign('addition', money('-1', 'ILS'))).toThrow();
    expect(() => assertChangeAmountSign('deduction', money('1', 'ILS'))).toThrow();
    expect(() => assertChangeAmountSign('deduction', money('-1', 'ILS'))).not.toThrow();
    expect(() => assertChangeAmountSign('scope', money('-1', 'ILS'))).not.toThrow();
    expect(() => assertChangeAmountSign('extension', money('0', 'ILS'))).not.toThrow();
  });

  it('requires weighted milestones to total exactly 100%', () => {
    expect(() =>
      assertWeightedLinesComplete([
        { lineType: 'weighted_milestone', weightPercent: '40' },
        { lineType: 'weighted_milestone', weightPercent: '50' },
      ]),
    ).toThrow();
    expect(() =>
      assertWeightedLinesComplete([
        { lineType: 'weighted_milestone', weightPercent: '40' },
        { lineType: 'weighted_milestone', weightPercent: '60' },
        { lineType: 'lump_sum', weightPercent: null },
      ]),
    ).not.toThrow();
  });

  it('adds days across month ends', () => {
    expect(addDaysToBusinessDate('2026-12-25', 10)).toBe('2027-01-04');
  });
});

describe('lifecycle', () => {
  it('walks draft -> active -> suspended -> active -> completed -> closed', () => {
    let status = assertAgreementAction('draft', 'activate');
    status = assertAgreementAction(status, 'suspend');
    status = assertAgreementAction(status, 'resume');
    status = assertAgreementAction(status, 'complete');
    expect(assertAgreementAction(status, 'close')).toBe('closed');
    expect(agreementActionTarget('cancel')).toBe('cancelled');
  });

  it('never re-opens closed agreements nor cancels running ones', () => {
    expect(availableAgreementActions('closed')).toEqual([]);
    expect(() => assertAgreementAction('active', 'cancel')).toThrow();
    expect(() => assertAgreementAction('closed', 'activate')).toThrow();
  });

  it('locks the baseline and gates changes on running agreements', () => {
    expect(() => assertBaselineEditable('draft')).not.toThrow();
    expect(() => assertBaselineEditable('active')).toThrow();
    expect(() => assertAgreementAcceptsChanges('draft')).toThrow();
    expect(() => assertAgreementAcceptsChanges('suspended')).not.toThrow();
    expect(() => assertAgreementClosable({ openChanges: 1, openUnpricedWork: 0 })).toThrow();
  });

  it('keeps decided changes and unpriced records final', () => {
    expect(canApplyChangeAction('approved', 'propose_version')).toBe(false);
    expect(() => assertChangeAction('rejected', 'approve')).toThrow();
    expect(() => assertChangeAction('under_negotiation', 'approve')).not.toThrow();
    expect(() => assertUnpricedWorkAction('converted', 'convert')).toThrow();
  });
});

describe('domain constants mirror the 0158 schema', () => {
  it('matches the Drizzle schema lists', () => {
    expect(domain.SUBCONTRACT_LINE_TYPES).toEqual(schema.SUBCONTRACT_LINE_TYPES);
    expect(domain.SUBCONTRACT_CHANGE_TYPES).toEqual(schema.SUBCONTRACT_CHANGE_TYPES);
    expect(domain.SUBCONTRACT_CHANGE_STATUSES).toEqual(schema.SUBCONTRACT_CHANGE_STATUSES);
    expect(domain.SUBCONTRACT_CHANGE_ORIGINS).toEqual(schema.SUBCONTRACT_CHANGE_ORIGINS);
    expect(domain.UNPRICED_WORK_STATUSES).toEqual(schema.UNPRICED_WORK_STATUSES);
    expect(domain.ADVANCE_RECOVERY_METHODS).toEqual(schema.ADVANCE_RECOVERY_METHODS);
    expect(domain.SUBCONTRACT_VAT_TREATMENTS).toEqual(schema.SUBCONTRACT_VAT_TREATMENTS);
  });
});
