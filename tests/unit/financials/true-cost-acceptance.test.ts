import { describe, expect, it } from 'vitest';
import { money, toNumericString } from '@/shared/money';
import {
  assertInstallmentScheduleConserves,
  buildEqualInstallmentSchedule,
  recognizedInstallmentToDate,
} from '@/modules/expenses/domain/installment-schedule';
import {
  allocateGeneralPoolByDirectActual,
  assertGeneralPoolConserves,
  fullProjectActual,
} from '@/modules/financials/domain/general-cost-allocation';
import {
  composeCompanyActual,
  composeCompanyActualFromOrgTotals,
  composeCompanyProfit,
  laborConservation,
  shouldSurfaceCompanyActual,
  vendorBillConservation,
} from '@/modules/financials/domain/company-actual';
import {
  consumeInventoryCostFifo,
  inventoryCostBasisConserves,
  unitCostFromPurchase,
} from '@/modules/assets/domain/inventory-cost';

const ILS = 'ILS';

describe('acceptance — installment schedule H', () => {
  it('10000 / 3 conserves exactly', () => {
    const schedule = buildEqualInstallmentSchedule({
      totalNet: money('10000', ILS),
      installmentCount: 3,
      startYearMonth: '2026-01',
    });
    assertInstallmentScheduleConserves(schedule, money('10000', ILS));
    expect(toNumericString(schedule.lines[0]!.amount)).toBe('3333.330000');
    expect(toNumericString(schedule.lines[1]!.amount)).toBe('3333.330000');
    expect(toNumericString(schedule.lines[2]!.amount)).toBe('3333.340000');
    expect(toNumericString(schedule.total)).toBe('10000.000000');
  });

  it('retro installment start Jan recognized through Aug = 8 months', () => {
    const schedule = buildEqualInstallmentSchedule({
      totalNet: money('12000', ILS),
      installmentCount: 12,
      startYearMonth: '2026-01',
    });
    const recognized = recognizedInstallmentToDate(schedule, '2026-08');
    expect(toNumericString(recognized)).toBe('8000.000000');
  });
});

describe('acceptance — general pool B/D/S', () => {
  it('weights Direct Actual 50/30/20 on 10000 pool', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('10000', ILS),
      projects: [
        { projectId: 'a', directActual: money('50000', ILS) },
        { projectId: 'b', directActual: money('30000', ILS) },
        { projectId: 'c', directActual: money('20000', ILS) },
      ],
    });
    assertGeneralPoolConserves(result);
    expect(toNumericString(result.allocated)).toBe('10000.000000');
    expect(toNumericString(result.unallocatable)).toBe('0.000000');
    const byId = Object.fromEntries(result.lines.map((l) => [l.projectId, l.amount.amount]));
    expect(Number(byId.a)).toBeCloseTo(5000, 5);
    expect(Number(byId.b)).toBeCloseTo(3000, 5);
    expect(Number(byId.c)).toBeCloseTo(2000, 5);
  });

  it('zero Direct Actual → equal split among eligible', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('9000', ILS),
      projects: [
        { projectId: 'a', directActual: money('0', ILS) },
        { projectId: 'b', directActual: money('0', ILS) },
        { projectId: 'c', directActual: money('0', ILS) },
      ],
    });
    assertGeneralPoolConserves(result);
    expect(result.basisMode).toBe('equal_split');
    expect(toNumericString(result.allocated)).toBe('9000.000000');
  });

  it('zero eligible projects → unallocatable', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('5000', ILS),
      projects: [],
    });
    assertGeneralPoolConserves(result);
    expect(toNumericString(result.unallocatable)).toBe('5000.000000');
    expect(result.lines).toHaveLength(0);
  });

  it('signed negative pool equal split among zero Direct projects', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('-1000', ILS),
      projects: [
        { projectId: 'a', directActual: money('0', ILS) },
        { projectId: 'b', directActual: money('0', ILS) },
      ],
    });
    assertGeneralPoolConserves(result);
    expect(result.basisMode).toBe('equal_split');
    expect(toNumericString(result.allocated)).toBe('-1000.000000');
    const byId = Object.fromEntries(result.lines.map((l) => [l.projectId, l.amount.amount]));
    expect(Number(byId.a)).toBeCloseTo(-500, 5);
    expect(Number(byId.b)).toBeCloseTo(-500, 5);
  });
});

describe('acceptance — company actual C/D/Q', () => {
  it('CompanyActual = Direct + General; SumFull + Unallocatable = Company', () => {
    const composition = composeCompanyActual({
      currency: ILS,
      directProjectActual: money('100000', ILS),
      generalPool: money('10000', ILS),
      allocatedGeneralToProjects: money('10000', ILS),
      unallocatableGeneral: money('0', ILS),
    });
    expect(composition.reconciles).toBe(true);
    expect(toNumericString(composition.companyActual)).toBe('110000.000000');
    expect(toNumericString(composition.sumFullProjectActual)).toBe('110000.000000');
  });

  it('org totals: Full − allocated = Direct; pool surfaces Company Actual', () => {
    const composition = composeCompanyActualFromOrgTotals({
      currency: ILS,
      fullProjectActual: money('110000', ILS),
      poolAmount: money('10000', ILS),
      allocatedAmount: money('10000', ILS),
      unallocatableAmount: money('0', ILS),
    });
    expect(composition).not.toBeNull();
    expect(composition?.reconciles).toBe(true);
    expect(toNumericString(composition!.directProjectActual)).toBe('100000.000000');
    expect(toNumericString(composition!.companyActual)).toBe('110000.000000');
    expect(shouldSurfaceCompanyActual(composition)).toBe(true);
  });

  it('company profit = revenue - company actual', () => {
    const profit = composeCompanyProfit({
      currency: ILS,
      recognizedCompanyRevenue: money('200000', ILS),
      companyActual: money('110000', ILS),
    });
    expect(toNumericString(profit.companyProfit!)).toBe('90000.000000');
  });

  it('unavailable revenue → null profit (not zero)', () => {
    const profit = composeCompanyProfit({
      currency: ILS,
      recognizedCompanyRevenue: null,
      companyActual: money('110000', ILS),
    });
    expect(profit.companyProfit).toBeNull();
  });
});

describe('acceptance — labor / vendor conservation E/F/G', () => {
  it('employer = project + general labor', () => {
    const result = laborConservation({
      totalEmployerCost: money('15000', ILS),
      projectLabor: money('12000', ILS),
      generalLabor: money('3000', ILS),
    });
    expect(result.reconciles).toBe(true);
  });

  it('bill 30k = 10+8+7+5', () => {
    const result = vendorBillConservation({
      recognizedNet: money('30000', ILS),
      projectAllocated: money('25000', ILS),
      generalRemainder: money('5000', ILS),
    });
    expect(result.reconciles).toBe(true);
  });
});

describe('acceptance — inventory O', () => {
  it('FIFO consume does not exceed purchase basis', () => {
    const unit = unitCostFromPurchase({
      netAmount: money('100000', ILS),
      quantity: '100',
    });
    expect(toNumericString(unit)).toBe('1000.000000');
    const consumed = consumeInventoryCostFifo({
      layers: [{ id: 'L1', remainingQty: '100', unitCost: unit }],
      quantity: '60',
      currency: ILS,
    });
    expect(toNumericString(consumed.totalAmount)).toBe('60000.000000');
    expect(consumed.remainingLayers[0]!.remainingQty).toBe('40.000000');
    expect(
      inventoryCostBasisConserves({
        purchaseBasis: money('100000', ILS),
        projectConsumed: consumed.totalAmount,
        writeoffs: money('0', ILS),
        remainingStock: money('40000', ILS),
      }),
    ).toBe(true);
  });
});

describe('acceptance — full project actual', () => {
  it('full = direct + allocated general', () => {
    const full = fullProjectActual({
      directActual: money('50000', ILS),
      allocatedGeneral: money('5000', ILS),
    });
    expect(toNumericString(full)).toBe('55000.000000');
  });

  it('rejects mixed-currency direct + allocated (V1 no FX)', () => {
    expect(() =>
      fullProjectActual({
        directActual: money('50000', 'USD'),
        allocatedGeneral: money('5000', ILS),
      }),
    ).toThrow();
  });
});
