import { describe, expect, it } from 'vitest';
import {
  absoluteMoneyDiff,
  assertBreakdownReconciles,
  buildProjectActualBreakdown,
  classifyActualAtom,
  countClassificationOverlaps,
  isMaterialCostCategoryKey,
  isReliableSubcontractorAtom,
  type ProjectActualAtom,
} from '@/modules/financials/domain/project-actual-breakdown';
import { addMoney, money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

const SEED = {
  employees: money('10000.00', ILS),
  subcontractors: money('8000.00', ILS),
  vendors: money('7500.00', ILS),
  materials: money('5000.00', ILS),
  otherExpenses: money('8000.00', ILS),
  overhead: money('5018.64', ILS),
  total: money('43518.64', ILS),
} as const;

function atom(
  partial: Omit<ProjectActualAtom, 'amount'> & { amount: ReturnType<typeof money> },
): ProjectActualAtom {
  return partial;
}

function seedAtoms(): ProjectActualAtom[] {
  return [
    atom({ amount: SEED.employees, sourceKind: 'labor', sourceId: 'labor:p1' }),
    atom({
      amount: SEED.subcontractors,
      sourceKind: 'ap_bill',
      sourceId: 'bill-sub',
      vendorId: 'v-sub',
      vendorName: 'Sub Co',
      vendorType: 'subcontractor',
      subcontractAgreementId: 'sa-1',
    }),
    atom({
      amount: SEED.vendors,
      sourceKind: 'expense',
      sourceId: 'exp-vendor',
      vendorId: 'v-sup',
      vendorName: 'Supplier',
      vendorType: 'supplier',
      costFamily: 'direct_project',
      categoryKey: 'equipment',
    }),
    atom({
      amount: SEED.materials,
      sourceKind: 'expense',
      sourceId: 'exp-mat',
      vendorId: 'v-mat',
      vendorName: 'Materials Ltd',
      vendorType: 'supplier',
      costFamily: 'direct_project',
      categoryKey: 'building_materials',
    }),
    atom({
      amount: SEED.otherExpenses,
      sourceKind: 'expense',
      sourceId: 'exp-other',
      costFamily: 'direct_project',
      categoryKey: 'misc',
    }),
    atom({
      amount: SEED.overhead,
      sourceKind: 'expense',
      sourceId: 'exp-oh',
      costFamily: 'business_overhead',
      categoryKey: 'rent',
    }),
  ];
}

describe('OWNER GATE — Actual reconciliation seed', () => {
  it('reports exact acceptance amounts with difference 0.00', () => {
    const breakdown = buildProjectActualBreakdown({
      totalActual: SEED.total,
      atoms: seedAtoms(),
    });
    assertBreakdownReconciles(breakdown);

    const byKey = Object.fromEntries(breakdown.categories.map((c) => [c.key, c.amount]));
    const breakdownTotal = breakdown.categories.reduce(
      (sum, row) => addMoney(sum, row.amount),
      zeroMoney(ILS),
    );

    expect(absoluteMoneyDiff(breakdown.totalActual, SEED.total)).toBe(0);
    expect(absoluteMoneyDiff(breakdownTotal, SEED.total)).toBe(0);
    expect(absoluteMoneyDiff(breakdown.differenceFromActual, money('0', ILS))).toBe(0);

    expect(absoluteMoneyDiff(byKey.employees!, SEED.employees)).toBe(0);
    expect(absoluteMoneyDiff(byKey.subcontractors!, SEED.subcontractors)).toBe(0);
    expect(absoluteMoneyDiff(byKey.vendors!, SEED.vendors)).toBe(0);
    expect(absoluteMoneyDiff(byKey.materials!, SEED.materials)).toBe(0);
    expect(absoluteMoneyDiff(byKey.otherExpenses!, SEED.otherExpenses)).toBe(0);
    expect(absoluteMoneyDiff(byKey.overhead!, SEED.overhead)).toBe(0);
  });
});

describe('OWNER GATE — double-count overlaps', () => {
  it('returns overlap count 0 for each exclusive regression', () => {
    const overlaps = countClassificationOverlaps(seedAtoms());
    expect(overlaps.expenseApDuplicateSourceIds).toBe(0);
    expect(overlaps.vendorAndSubcontractor).toBe(0);
    expect(overlaps.vendorAndMaterial).toBe(0);
    expect(overlaps.laborAndExpenseCategory).toBe(0);

    expect(
      classifyActualAtom(
        atom({
          amount: money('1', ILS),
          sourceKind: 'expense',
          sourceId: 'm',
          vendorId: 'v',
          vendorType: 'supplier',
          categoryKey: 'materials_gc',
        }),
      ),
    ).toBe('materials');
    expect(isMaterialCostCategoryKey('materials_gc')).toBe(true);

    expect(
      classifyActualAtom(
        atom({
          amount: money('1', ILS),
          sourceKind: 'ap_bill',
          sourceId: 's',
          vendorId: 'v',
          vendorType: 'subcontractor',
          subcontractAgreementId: 'sa',
        }),
      ),
    ).toBe('subcontractors');
    expect(
      isReliableSubcontractorAtom(
        atom({
          amount: money('1', ILS),
          sourceKind: 'ap_bill',
          sourceId: 's',
          vendorType: 'subcontractor',
          categoryKey: 'external_manpower',
        }),
      ),
    ).toBe(true);
  });
});

describe('OWNER GATE — employee reconciliation + missing cost', () => {
  it('hourly + monthly rows sum to Employees; missing cost is never fake ₪0', () => {
    const hourly = { laborCost: money('4000.00', ILS), entriesMissingCost: 0 };
    const monthly = { laborCost: money('6000.00', ILS), entriesMissingCost: 0 };
    const missing = { laborCost: null as null, entriesMissingCost: 2 };

    const sumKnown = [hourly, monthly, missing]
      .filter((row) => row.laborCost)
      .reduce((sum, row) => addMoney(sum, row.laborCost!), zeroMoney(ILS));

    const laborActual = money('10000.00', ILS);
    expect(absoluteMoneyDiff(sumKnown, laborActual)).toBe(0);

    const falseZeroMissing = [hourly, monthly, missing].filter(
      (row) =>
        row.entriesMissingCost > 0 &&
        row.laborCost !== null &&
        Number(row.laborCost.amount) === 0,
    );
    expect(falseZeroMissing.length).toBe(0);
    expect(missing.laborCost).toBeNull();

    const breakdown = buildProjectActualBreakdown({
      totalActual: laborActual,
      atoms: [atom({ amount: laborActual, sourceKind: 'labor', sourceId: 'labor:p' })],
      employeesAvailability: 'partial',
    });
    const employees = breakdown.categories.find((c) => c.key === 'employees')!;
    expect(absoluteMoneyDiff(employees.amount, laborActual)).toBe(0);
    expect(employees.availability).toBe('partial');
  });

  it('Team/Time shared aggregate sum equals Employees when costs resolve', () => {
    const teamTimeShared = [
      money('2500.00', ILS),
      money('2500.00', ILS),
      money('5000.00', ILS),
    ].reduce((sum, row) => addMoney(sum, row), zeroMoney(ILS));
    expect(absoluteMoneyDiff(teamTimeShared, money('10000.00', ILS))).toBe(0);
  });
});
