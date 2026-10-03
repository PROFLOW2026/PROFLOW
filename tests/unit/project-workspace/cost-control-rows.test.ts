import { describe, expect, it } from 'vitest';
import {
  attachTradeBudgets,
  buildCostControlAgreementRow,
  rollupCostControlByTrade,
  sumApNetFromBills,
  sumSubmittedClaimsByAgreement,
  type CostControlAgreementRow,
  type CostControlBudgetLine,
  type TradeBudgetSource,
} from '@/modules/project-workspace';

describe('cost control rows (Track S)', () => {
  it('sums submitted claims per agreement without mixing statuses', () => {
    const map = sumSubmittedClaimsByAgreement([
      { agreementId: 'a1', currency: 'ILS', status: 'submitted', currentSubmitted: '100.000000' },
      { agreementId: 'a1', currency: 'ILS', status: 'under_review', currentSubmitted: '50.000000' },
      { agreementId: 'a1', currency: 'ILS', status: 'certified', currentSubmitted: '999.000000' },
      { agreementId: 'a2', currency: 'ILS', status: 'returned', currentSubmitted: '10.000000' },
    ]);
    expect(map.get('a1')).toEqual({ amount: '150.000000', currency: 'ILS' });
    expect(map.get('a2')).toEqual({ amount: '10.000000', currency: 'ILS' });
  });

  it('sums AP net from bill facts', () => {
    expect(
      sumApNetFromBills([
        { currency: 'ILS', netAmount: '1000.000000' },
        { currency: 'ILS', netAmount: '250.500000' },
      ]),
    ).toEqual({ amount: '1250.500000', currency: 'ILS' });
  });

  it('builds separate figure slots with unavailable when data is missing', () => {
    const row = buildCostControlAgreementRow({
      agreementId: 'a1',
      vendorName: 'Vendor',
      title: 'Electrical',
      trade: 'Electric',
      status: 'active',
      contractValue: { original: '100', approvedChanges: '20', current: '120', currency: 'ILS' },
      submittedClaims: null,
      paymentTotals: null,
      apNet: null,
    });
    expect(row.committed).toEqual({ kind: 'money', amount: '120', currency: 'ILS' });
    expect(row.submittedClaims).toEqual({ kind: 'unavailable' });
    expect(row.paid).toEqual({ kind: 'unavailable' });
    expect(row.workPackageId).toBeNull();
  });
});

function agreementRow(input: {
  agreementId?: string;
  trade?: string | null;
  workPackageId?: string | null;
  committed?: string;
  approvedChanges?: string;
  certified?: string | null;
  paid?: string | null;
  currency?: string;
}): CostControlAgreementRow {
  const currency = input.currency ?? 'ILS';
  return buildCostControlAgreementRow({
    agreementId: input.agreementId ?? 'a1',
    vendorName: 'Vendor',
    title: 'Package',
    trade: input.trade === undefined ? 'Electric' : input.trade,
    workPackageId: input.workPackageId ?? null,
    status: 'active',
    contractValue: {
      original: input.committed ?? '100.000000',
      approvedChanges: input.approvedChanges ?? '0.000000',
      current: input.committed ?? '100.000000',
      currency,
    },
    submittedClaims: null,
    paymentTotals:
      input.certified == null && input.paid == null
        ? null
        : {
            certified: input.certified ?? '0.000000',
            paid: input.paid ?? '0.000000',
            retentionHeld: '0.000000',
            currency,
          },
    apNet: null,
  });
}

function budgetLine(input: Partial<CostControlBudgetLine> & Pick<CostControlBudgetLine, 'lineType' | 'amount'>): CostControlBudgetLine {
  return {
    revisionNumber: input.revisionNumber ?? 1,
    lineType: input.lineType,
    workPackageId: input.workPackageId ?? null,
    disciplineKey: input.disciplineKey ?? null,
    costCodeId: input.costCodeId ?? null,
    amount: input.amount,
    currency: input.currency ?? 'ILS',
  };
}

function budgetSource(input: Partial<TradeBudgetSource> = {}): TradeBudgetSource {
  return {
    canReadBudget: input.canReadBudget ?? true,
    currency: input.currency === undefined ? 'ILS' : input.currency,
    originalLines: input.originalLines ?? [],
    approvedLines: input.approvedLines ?? [],
    approvedCostCodeAmounts: input.approvedCostCodeAmounts ?? [],
  };
}

describe('cost control trade rollup', () => {
  it('groups by trade and sums each commitment column on its own', () => {
    const rollups = rollupCostControlByTrade([
      agreementRow({ agreementId: 'a1', trade: 'Electric', committed: '100.000000', approvedChanges: '10.000000', certified: '40.000000', paid: '20.000000' }),
      agreementRow({ agreementId: 'a2', trade: ' electric ', committed: '50.000000', approvedChanges: '5.000000', certified: '10.000000', paid: '10.000000' }),
      agreementRow({ agreementId: 'a3', trade: 'Plumbing', committed: '80.000000' }),
    ]);

    expect(rollups.map((rollup) => rollup.tradeKey)).toEqual(['electric', 'plumbing']);
    const electric = rollups[0]!;
    expect(electric.agreementIds).toEqual(['a1', 'a2']);
    expect(electric.committed).toEqual({ kind: 'money', amount: '150.000000', currency: 'ILS' });
    expect(electric.approvedChanges).toEqual({ kind: 'money', amount: '15.000000', currency: 'ILS' });
    expect(electric.certified).toEqual({ kind: 'money', amount: '50.000000', currency: 'ILS' });
    expect(electric.paid).toEqual({ kind: 'money', amount: '30.000000', currency: 'ILS' });
    expect(electric.submittedClaims).toEqual({ kind: 'unavailable' });
    expect(electric.apActual).toEqual({ kind: 'unavailable' });
    expect(electric.originalBudget).toEqual({ kind: 'unavailable' });
    expect(electric.forecastRemaining).toEqual({ kind: 'money', amount: '100.000000', currency: 'ILS' });
    expect(electric.forecastFinal).toEqual({ kind: 'money', amount: '150.000000', currency: 'ILS' });
    expect(electric.committed).not.toEqual(electric.certified);
  });

  it('keeps a trade total unavailable when any agreement in that column is unavailable or the currency differs', () => {
    const mixed = rollupCostControlByTrade([
      agreementRow({ agreementId: 'a1', trade: 'Electric', certified: '10.000000' }),
      agreementRow({ agreementId: 'a2', trade: 'Electric' }),
    ]);
    expect(mixed[0]!.certified).toEqual({ kind: 'unavailable' });
    expect(mixed[0]!.committed).toEqual({ kind: 'money', amount: '200.000000', currency: 'ILS' });

    const currencies = rollupCostControlByTrade([
      agreementRow({ agreementId: 'a1', trade: 'Electric', committed: '10.000000', currency: 'ILS' }),
      agreementRow({ agreementId: 'a2', trade: 'Electric', committed: '10.000000', currency: 'USD' }),
    ]);
    expect(currencies[0]!.committed).toEqual({ kind: 'unavailable' });
  });

  it('puts agreements without a trade in one unassigned group', () => {
    const rollups = rollupCostControlByTrade([
      agreementRow({ agreementId: 'a1', trade: null, committed: '5.000000' }),
      agreementRow({ agreementId: 'a2', trade: '  ', committed: '7.000000' }),
    ]);
    expect(rollups).toHaveLength(1);
    expect(rollups[0]!.trade).toBeNull();
    expect(rollups[0]!.committed).toEqual({ kind: 'money', amount: '12.000000', currency: 'ILS' });
  });
});

describe('cost control trade budgets', () => {
  it('reads original and approved budget from discipline lines without mixing them into commitment', () => {
    const [rollup] = attachTradeBudgets(
      rollupCostControlByTrade([agreementRow({ trade: 'Electric', committed: '40.000000' })]),
      budgetSource({
        originalLines: [budgetLine({ lineType: 'discipline', disciplineKey: 'electric', amount: '1000.000000', revisionNumber: 1 })],
        approvedLines: [budgetLine({ lineType: 'discipline', disciplineKey: 'Electric', amount: '1200.000000', revisionNumber: 2 })],
      }),
    );
    expect(rollup!.originalBudget).toEqual({ kind: 'money', amount: '1000.000000', currency: 'ILS' });
    expect(rollup!.approvedBudget).toEqual({ kind: 'money', amount: '1200.000000', currency: 'ILS' });
    expect(rollup!.committed).toEqual({ kind: 'money', amount: '40.000000', currency: 'ILS' });
    expect(rollup!.forecastRemaining).toEqual({ kind: 'unavailable' });
    expect(rollup!.forecastFinal).toEqual({ kind: 'money', amount: '40.000000', currency: 'ILS' });
  });

  it('uses a unique cost-code amount for the approved figure and leaves original on the revision line', () => {
    const [rollup] = attachTradeBudgets(
      rollupCostControlByTrade([agreementRow({ trade: 'Electric', workPackageId: 'p1' })]),
      budgetSource({
        originalLines: [
          budgetLine({
            lineType: 'work_package',
            workPackageId: 'p1',
            costCodeId: 'cc1',
            amount: '800.000000',
            revisionNumber: 1,
          }),
        ],
        approvedLines: [
          budgetLine({
            lineType: 'work_package',
            workPackageId: 'p1',
            costCodeId: 'cc1',
            amount: '900.000000',
            revisionNumber: 2,
          }),
        ],
        approvedCostCodeAmounts: [{ costCodeId: 'cc1', amount: '950.000000', currency: 'ILS' }],
      }),
    );
    expect(rollup!.originalBudget).toEqual({ kind: 'money', amount: '800.000000', currency: 'ILS' });
    expect(rollup!.approvedBudget).toEqual({ kind: 'money', amount: '950.000000', currency: 'ILS' });
  });

  it('sums exclusive work-package lines and does not add the discipline line on top', () => {
    const [rollup] = attachTradeBudgets(
      rollupCostControlByTrade([
        agreementRow({ agreementId: 'a1', trade: 'Electric', workPackageId: 'p1', committed: '10.000000' }),
        agreementRow({ agreementId: 'a2', trade: 'Electric', workPackageId: 'p2', committed: '10.000000' }),
      ]),
      budgetSource({
        originalLines: [
          budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '100.000000' }),
          budgetLine({ lineType: 'work_package', workPackageId: 'p2', amount: '200.000000' }),
          budgetLine({ lineType: 'discipline', disciplineKey: 'Electric', amount: '999.000000' }),
          budgetLine({ lineType: 'total', amount: '5000.000000' }),
        ],
        approvedLines: [
          budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '100.000000' }),
          budgetLine({ lineType: 'work_package', workPackageId: 'p2', amount: '200.000000' }),
          budgetLine({ lineType: 'discipline', disciplineKey: 'Electric', amount: '999.000000' }),
          budgetLine({ lineType: 'total', amount: '5000.000000' }),
        ],
      }),
    );
    expect(rollup!.originalBudget).toEqual({ kind: 'money', amount: '300.000000', currency: 'ILS' });
    expect(rollup!.approvedBudget).toEqual({ kind: 'money', amount: '300.000000', currency: 'ILS' });
  });

  it('does not invent a trade budget from a partial work-package split or a shared package', () => {
    const partial = attachTradeBudgets(
      rollupCostControlByTrade([
        agreementRow({ agreementId: 'a1', trade: 'Electric', workPackageId: 'p1' }),
        agreementRow({ agreementId: 'a2', trade: 'Electric', workPackageId: 'p2' }),
      ]),
      budgetSource({
        originalLines: [budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '100.000000' })],
        approvedLines: [budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '100.000000' })],
      }),
    );
    expect(partial[0]!.approvedBudget).toEqual({ kind: 'unavailable' });

    const shared = attachTradeBudgets(
      rollupCostControlByTrade([
        agreementRow({ agreementId: 'a1', trade: 'Electric', workPackageId: 'p1' }),
        agreementRow({ agreementId: 'a2', trade: 'Plumbing', workPackageId: 'p1' }),
      ]),
      budgetSource({
        originalLines: [budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '500.000000' })],
        approvedLines: [budgetLine({ lineType: 'work_package', workPackageId: 'p1', amount: '500.000000' })],
      }),
    );
    expect(shared.every((rollup) => rollup.approvedBudget.kind === 'unavailable')).toBe(true);
    expect(shared.every((rollup) => rollup.forecastFinal.kind === 'money')).toBe(true);
  });

  it('attributes cost-code lines by work package when no coarser budget line exists', () => {
    const [rollup] = attachTradeBudgets(
      rollupCostControlByTrade([agreementRow({ trade: 'Electric', workPackageId: 'p1' })]),
      budgetSource({
        originalLines: [
          budgetLine({ lineType: 'cost_code', workPackageId: 'p1', costCodeId: 'cc1', amount: '70.000000' }),
        ],
        approvedLines: [
          budgetLine({ lineType: 'cost_code', workPackageId: 'p1', costCodeId: 'cc1', amount: '70.000000' }),
        ],
        approvedCostCodeAmounts: [{ costCodeId: 'cc1', amount: '75.000000', currency: 'ILS' }],
      }),
    );
    expect(rollup!.originalBudget).toEqual({ kind: 'money', amount: '70.000000', currency: 'ILS' });
    expect(rollup!.approvedBudget).toEqual({ kind: 'money', amount: '75.000000', currency: 'ILS' });
  });

  it('hides budget figures when the viewer cannot read the budget', () => {
    const [rollup] = attachTradeBudgets(
      rollupCostControlByTrade([agreementRow({ trade: 'Electric', committed: '40.000000' })]),
      budgetSource({
        canReadBudget: false,
        originalLines: [budgetLine({ lineType: 'discipline', disciplineKey: 'Electric', amount: '1000.000000' })],
        approvedLines: [budgetLine({ lineType: 'discipline', disciplineKey: 'Electric', amount: '1200.000000' })],
      }),
    );
    expect(rollup!.originalBudget).toEqual({ kind: 'unavailable' });
    expect(rollup!.approvedBudget).toEqual({ kind: 'unavailable' });
    expect(rollup!.committed).toEqual({ kind: 'money', amount: '40.000000', currency: 'ILS' });
    expect(rollup!.forecastRemaining).toEqual({ kind: 'unavailable' });
    expect(rollup!.forecastFinal).toEqual({ kind: 'money', amount: '40.000000', currency: 'ILS' });
  });
});
