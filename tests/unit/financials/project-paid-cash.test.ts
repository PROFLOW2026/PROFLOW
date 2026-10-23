import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { composeProjectPaidCash, type ProjectPaidFact } from '@/modules/financials/domain/project-paid-cash';

const ILS = 'ILS';

function fact(overrides: Partial<ProjectPaidFact> & Pick<ProjectPaidFact, 'kind' | 'parentId'>): ProjectPaidFact {
  return {
    projectId: null,
    projectName: null,
    categoryKey: null,
    subcontractAgreementId: null,
    parentNet: '0',
    parentGross: '0',
    paidGross: '0',
    lineAmount: null,
    amountBasis: null,
    knownAmount: null,
    hasAllocation: false,
    ...overrides,
  };
}

describe('composeProjectPaidCash', () => {
  it('keeps only the paid share of a split expense and does not repeat the header', () => {
    const result = composeProjectPaidCash(
      [
        fact({
          kind: 'expense_header',
          parentId: 'e1',
          projectId: 'p-header',
          projectName: 'Header',
          parentNet: '100',
          parentGross: '118',
          paidGross: '59',
          hasAllocation: true,
        }),
        fact({
          kind: 'expense_line',
          parentId: 'e1',
          projectId: 'p1',
          projectName: 'Alpha',
          parentNet: '100',
          parentGross: '118',
          paidGross: '59',
          lineAmount: '60',
          amountBasis: 'net',
          hasAllocation: true,
        }),
        fact({
          kind: 'expense_line',
          parentId: 'e1',
          projectId: 'p2',
          projectName: 'Beta',
          parentNet: '100',
          parentGross: '118',
          paidGross: '59',
          lineAmount: '40',
          amountBasis: 'net',
          hasAllocation: true,
        }),
      ],
      ILS,
    );

    expect(Number(result?.net.amount)).toBeCloseTo(50, 2);
    expect(Number(result?.gross.amount)).toBeCloseTo(59, 2);
    expect(result?.projects.map((project) => [project.projectName, Number(project.net.amount)])).toEqual([
      ['Alpha', 30],
      ['Beta', 20],
    ]);
    expect(result?.projects.some((project) => project.projectName === 'Header')).toBe(false);
  });

  it('attributes payroll only by the project share of employer cost', () => {
    const result = composeProjectPaidCash(
      [
        fact({
          kind: 'payroll_line',
          parentId: 'pay1',
          projectId: 'p1',
          projectName: 'Alpha',
          paidGross: '90',
          parentNet: '90',
          parentGross: '90',
          lineAmount: '40',
          knownAmount: '100',
          amountBasis: 'net',
        }),
      ],
      ILS,
    );

    expect(Number(result?.labor.net.amount)).toBeCloseTo(36, 2);
    expect(Number(result?.net.amount)).toBeCloseTo(36, 2);
  });

  it('sends a vendor bill to suppliers and a subcontract bill to contractors', () => {
    const result = composeProjectPaidCash(
      [
        fact({
          kind: 'ap_header',
          parentId: 'b1',
          projectId: 'p1',
          projectName: 'Alpha',
          parentNet: '100',
          parentGross: '100',
          paidGross: '100',
        }),
        fact({
          kind: 'ap_header',
          parentId: 'b2',
          projectId: 'p1',
          projectName: 'Alpha',
          subcontractAgreementId: 'agr',
          parentNet: '40',
          parentGross: '40',
          paidGross: '40',
        }),
        fact({
          kind: 'advance',
          parentId: 'adv',
          projectId: 'p1',
          projectName: 'Alpha',
          paidGross: '10',
          parentNet: '10',
          parentGross: '10',
        }),
      ],
      ILS,
    );

    expect(Number(result?.suppliers.net.amount)).toBeCloseTo(100, 2);
    expect(Number(result?.contractors.net.amount)).toBeCloseTo(50, 2);
    expect(money(result?.net.amount ?? '0', ILS).amount).toBe(result?.net.amount);
  });

  it('puts material purchases in supplier payments', () => {
    const result = composeProjectPaidCash(
      [
        fact({
          kind: 'expense_header',
          parentId: 'e3',
          projectId: 'p1',
          projectName: 'Alpha',
          categoryKey: 'materials',
          parentNet: '25',
          parentGross: '25',
          paidGross: '25',
        }),
      ],
      ILS,
    );

    expect(Number(result?.suppliers.net.amount)).toBeCloseTo(25, 2);
    expect(Number(result?.other.net.amount)).toBeCloseTo(0, 2);
  });

  it('drops a company-only expense that has no project', () => {
    const result = composeProjectPaidCash(
      [
        fact({
          kind: 'expense_header',
          parentId: 'e2',
          parentNet: '80',
          parentGross: '80',
          paidGross: '80',
        }),
      ],
      ILS,
    );

    expect(result).toBeNull();
  });
});
