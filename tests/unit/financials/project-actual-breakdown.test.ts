import { describe, expect, it } from 'vitest';
import {
  absoluteMoneyDiff,
  assertBreakdownReconciles,
  buildProjectActualBreakdown,
  classifyActualAtom,
  isMaterialCostCategoryKey,
  isReliableSubcontractorAtom,
  type ProjectActualAtom,
} from '@/modules/financials/domain/project-actual-breakdown';
import { money } from '@/shared/money';

const ILS = 'ILS';

/** Acceptance seed: exclusive categories sum to Owner Actual ₪43,518.64 */
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

describe('project actual breakdown — Owner exclusive partition', () => {
  it('identity: seeded categories sum exactly to ₪43,518.64', () => {
    const atoms: ProjectActualAtom[] = [
      atom({
        amount: SEED.employees,
        sourceKind: 'labor',
        sourceId: 'labor:p1',
      }),
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

    const breakdown = buildProjectActualBreakdown({
      totalActual: SEED.total,
      atoms,
    });

    assertBreakdownReconciles(breakdown);
    expect(absoluteMoneyDiff(breakdown.totalActual, SEED.total)).toBe(0);
    expect(absoluteMoneyDiff(breakdown.differenceFromActual, money('0', ILS))).toBe(0);

    const byKey = Object.fromEntries(breakdown.categories.map((c) => [c.key, c.amount]));
    expect(absoluteMoneyDiff(byKey.employees!, SEED.employees)).toBe(0);
    expect(absoluteMoneyDiff(byKey.subcontractors!, SEED.subcontractors)).toBe(0);
    expect(absoluteMoneyDiff(byKey.vendors!, SEED.vendors)).toBe(0);
    expect(absoluteMoneyDiff(byKey.materials!, SEED.materials)).toBe(0);
    expect(absoluteMoneyDiff(byKey.otherExpenses!, SEED.otherExpenses)).toBe(0);
    expect(absoluteMoneyDiff(byKey.overhead!, SEED.overhead)).toBe(0);
  });

  it('excludes double-count: material with vendor is Materials not Vendors', () => {
    expect(
      classifyActualAtom(
        atom({
          amount: money('100', ILS),
          sourceKind: 'expense',
          sourceId: '1',
          vendorId: 'v1',
          vendorType: 'supplier',
          categoryKey: 'materials_gc',
          costFamily: 'direct_project',
        }),
      ),
    ).toBe('materials');
  });

  it('vendor type both alone is Vendors, not Subcontractors', () => {
    const bothOnly = atom({
      amount: money('100', ILS),
      sourceKind: 'expense',
      sourceId: '1',
      vendorId: 'v1',
      vendorType: 'both',
      categoryKey: 'services',
    });
    expect(isReliableSubcontractorAtom(bothOnly)).toBe(false);
    expect(classifyActualAtom(bothOnly)).toBe('vendors');
  });

  it('subcontractAgreementId or subcontract category → Subcontractors', () => {
    expect(
      isReliableSubcontractorAtom(
        atom({
          amount: money('1', ILS),
          sourceKind: 'ap_bill',
          sourceId: 'b1',
          vendorType: 'supplier',
          subcontractAgreementId: 'sa-9',
        }),
      ),
    ).toBe(true);
    expect(
      isReliableSubcontractorAtom(
        atom({
          amount: money('1', ILS),
          sourceKind: 'expense',
          sourceId: 'e1',
          vendorType: 'subcontractor',
          vendorId: 'v',
          categoryKey: 'external_manpower',
        }),
      ),
    ).toBe(true);
  });

  it('materials keys are deterministic; vendor name alone is not materials', () => {
    expect(isMaterialCostCategoryKey('materials')).toBe(true);
    expect(isMaterialCostCategoryKey('install_materials')).toBe(true);
    expect(isMaterialCostCategoryKey('equipment')).toBe(false);
    expect(
      classifyActualAtom(
        atom({
          amount: money('50', ILS),
          sourceKind: 'expense',
          sourceId: 'x',
          vendorId: 'v',
          vendorName: 'Materials Warehouse',
          vendorType: 'supplier',
          categoryKey: 'equipment',
        }),
      ),
    ).toBe('vendors');
  });

  it('labor atoms always classify as employees', () => {
    expect(
      classifyActualAtom(
        atom({ amount: money('10', ILS), sourceKind: 'labor', sourceId: 'l' }),
      ),
    ).toBe('employees');
  });

  it('folds ≤₪0.01 residual into Other and still reconciles', () => {
    const breakdown = buildProjectActualBreakdown({
      totalActual: money('100.01', ILS),
      atoms: [
        atom({ amount: money('100.00', ILS), sourceKind: 'labor', sourceId: 'l' }),
      ],
    });
    expect(breakdown.reconciles).toBe(true);
    expect(absoluteMoneyDiff(breakdown.differenceFromActual, money('0', ILS))).toBe(0);
    const other = breakdown.categories.find((c) => c.key === 'otherExpenses')!;
    expect(absoluteMoneyDiff(other.amount, money('0.01', ILS))).toBe(0);
  });

  it('fails reconcile when residual exceeds ₪0.01', () => {
    const breakdown = buildProjectActualBreakdown({
      totalActual: money('100.05', ILS),
      atoms: [
        atom({ amount: money('100.00', ILS), sourceKind: 'labor', sourceId: 'l' }),
      ],
    });
    expect(breakdown.reconciles).toBe(false);
    expect(() => assertBreakdownReconciles(breakdown)).toThrow(/does not reconcile/);
  });
});
