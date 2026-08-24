import { describe, expect, it } from 'vitest';

import { money, toNumericString } from '@/shared/money';

import {

  allocateGeneralPoolByDirectActual,

  assertGeneralPoolConserves,

} from '@/modules/financials/domain/general-cost-allocation';

import { buildGeneralCostSourceKey } from '@/modules/financials/domain/company-actual';



const ILS = 'ILS';



describe('general-cost-allocation — signed pools', () => {

  it('negative pool splits 50/50 into negative allocations', () => {

    const result = allocateGeneralPoolByDirectActual({

      pool: money('-1000', ILS),

      projects: [

        { projectId: 'a', directActual: money('5000', ILS) },

        { projectId: 'b', directActual: money('5000', ILS) },

      ],

    });

    assertGeneralPoolConserves(result);

    expect(result.basisMode).toBe('direct_actual_weight');

    expect(toNumericString(result.allocated)).toBe('-1000.000000');

    expect(toNumericString(result.unallocatable)).toBe('0.000000');

    const byId = Object.fromEntries(result.lines.map((l) => [l.projectId, l.amount.amount]));

    expect(Number(byId.a)).toBeCloseTo(-500, 5);

    expect(Number(byId.b)).toBeCloseTo(-500, 5);

  });



  it('negative Direct Actual gets zero weight; positive projects absorb pool', () => {

    const result = allocateGeneralPoolByDirectActual({

      pool: money('1000', ILS),

      projects: [

        { projectId: 'a', directActual: money('5000', ILS) },

        { projectId: 'b', directActual: money('-2000', ILS) },

        { projectId: 'c', directActual: money('5000', ILS) },

      ],

    });

    assertGeneralPoolConserves(result);

    expect(result.basisMode).toBe('direct_actual_weight');

    const byId = Object.fromEntries(result.lines.map((l) => [l.projectId, l]));

    expect(Number(byId.a!.amount.amount)).toBeCloseTo(500, 5);

    expect(byId.b).toBeUndefined();

    expect(Number(byId.c!.amount.amount)).toBeCloseTo(500, 5);

  });



  it('all negative Direct → equal split with positive weights', () => {

    const result = allocateGeneralPoolByDirectActual({

      pool: money('900', ILS),

      projects: [

        { projectId: 'a', directActual: money('-100', ILS) },

        { projectId: 'b', directActual: money('-200', ILS) },

        { projectId: 'c', directActual: money('-50', ILS) },

      ],

    });

    assertGeneralPoolConserves(result);

    expect(result.basisMode).toBe('equal_split');

    expect(result.lines).toHaveLength(3);

    for (const line of result.lines) {

      expect(Number(line.weightPercent)).toBeGreaterThanOrEqual(0);

      expect(Number(line.weightPercent)).toBeLessThanOrEqual(100);

    }

  });



  it('preserves original directActualBasis including negatives', () => {

    const result = allocateGeneralPoolByDirectActual({

      pool: money('100', ILS),

      projects: [{ projectId: 'a', directActual: money('-500', ILS) }],

    });

    assertGeneralPoolConserves(result);

    expect(result.basisMode).toBe('equal_split');

    expect(toNumericString(result.lines[0]!.directActualBasis)).toBe('-500.000000');

  });



  it('drops exact-zero allocation lines but conserves pool', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('1000', ILS),
      projects: [
        { projectId: 'a', directActual: money('10000', ILS) },
        { projectId: 'b', directActual: money('0', ILS) },
      ],
    });
    assertGeneralPoolConserves(result);
    expect(result.lines.map((l) => l.projectId)).toEqual(['a']);
    expect(toNumericString(result.allocated)).toBe('1000.000000');
  });

  it('V1: does not allocate ILS pool into USD project Full Actual (mixed currency → unallocatable)', () => {
    const result = allocateGeneralPoolByDirectActual({
      pool: money('10000', ILS),
      projects: [{ projectId: 'usd-project', directActual: money('50000', 'USD') }],
    });
    assertGeneralPoolConserves(result);
    expect(result.basisMode).toBe('none');
    expect(result.lines).toHaveLength(0);
    expect(toNumericString(result.unallocatable)).toBe('10000.000000');
    expect(toNumericString(result.allocated)).toBe('0.000000');
  });
});



describe('buildGeneralCostSourceKey — idempotent source identity', () => {

  it('uses aggregate suffix when sourceId absent', () => {

    expect(buildGeneralCostSourceKey('expense_unallocated')).toBe('expense_unallocated:aggregate');

    expect(buildGeneralCostSourceKey('labor_non_project', null)).toBe(

      'labor_non_project:aggregate',

    );

  });



  it('embeds sourceId when present', () => {

    const id = '11111111-1111-1111-1111-111111111111';

    expect(buildGeneralCostSourceKey('ap_bill_remainder', id)).toBe(`ap_bill_remainder:${id}`);

  });



  it('is stable across repeated calls', () => {

    const key = buildGeneralCostSourceKey('inventory_writeoff');

    expect(buildGeneralCostSourceKey('inventory_writeoff')).toBe(key);

  });

});


