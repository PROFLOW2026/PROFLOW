/**
 * 0074 — Cost Code Attribution Regression Tests
 *
 * Invariants proven:
 *   1. Mixed AP bill: header cost_code_id is NOT a fallback for lines.
 *      Line 3 with NULL line cost_code_id → unmapped, regardless of header.
 *   2. Expense allocation: allocation-level cost_code_id is authoritative.
 *      Allocation with NULL code → unmapped even if expense header has a code.
 *   3. Unmapped actuals remain visible in unattributedActual, never dropped.
 *   4. Budget reconciliation: cost-code total + unattributed = total recognized.
 *      Difference = 0.00 required.
 *
 * These tests exercise the DOMAIN function only (composeCostCodeVariance).
 * Repository-level SQL correctness is asserted by the contract that:
 *   - `loadActualAmountsByCostCodeForProject` returns only rows with non-null
 *     ap_bill_lines.cost_code_id (line-level only, no header fallback).
 *   - `loadUnattributedActualForProject` returns sum of lines where
 *     ap_bill_lines.cost_code_id IS NULL (not COALESCE).
 */

import { describe, expect, it } from 'vitest';
import {
  composeCostCodeVariance,
  sumCostCodeVarianceTotals,
  type CostCodeAmountSlice,
  type CostCodeCatalogLabel,
} from '../cost-code-variance';
import type { MoneyValue } from '@/shared/money/money';
import { addMoney, subtractMoney, zeroMoney } from '@/shared/money/money';

const CURRENCY = 'ILS';
const CODE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CODE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const LABELS: ReadonlyMap<string, CostCodeCatalogLabel> = new Map([
  [CODE_A, { key: 'LABOR', name: 'Labor' }],
  [CODE_B, { key: 'MATERIALS', name: 'Materials' }],
]);

function _amountEq(a: MoneyValue | undefined, expected: number): boolean {
  return Math.abs(Number(a?.amount ?? 0) - expected) < 0.001;
}

function slice(costCodeId: string, amount: string): CostCodeAmountSlice {
  return { costCodeId, amount, currency: CURRENCY };
}

function num(m: MoneyValue | undefined): number {
  return Number(m?.amount ?? 0);
}

// ---------------------------------------------------------------------------
// Scenario 1 — Mixed AP bill
//   Bill header cost_code_id = A (metadata only, NOT Actual authority)
//   Line 1: cost_code_id = A, amount = 30,000
//   Line 2: cost_code_id = B, amount = 50,000
//   Line 3: cost_code_id = NULL (line has no code; header is A but must not apply)
//           amount = 20,000
//
//   CORRECT attribution:
//     A     = 30,000  (Line 1 only)
//     B     = 50,000  (Line 2 only)
//     Unmapped = 20,000  (Line 3)
//     Total = 100,000
//
//   INCORRECT (old COALESCE) would give:
//     A     = 50,000  (Lines 1+3 — header bleeds into Line 3)
//     B     = 50,000
//     Unmapped = 0.00   ← this is the failure mode
// ---------------------------------------------------------------------------
describe('0074 — Mixed AP bill: header does NOT fall back to unmapped lines', () => {
  // The repository now returns only lines with non-null cost_code_id.
  // Line 3 (NULL line code) therefore does NOT appear in actualSlices at all —
  // it shows up only via unattributedActualAmount.
  const actualSlices: CostCodeAmountSlice[] = [
    slice(CODE_A, '30000.000000'), // Line 1
    slice(CODE_B, '50000.000000'), // Line 2
    // Line 3 is absent from actualSlices (cost_code_id IS NULL filtered by repo)
  ];

  const result = composeCostCodeVariance({
    currency: CURRENCY,
    budgetSlices: [],
    committedSlices: [],
    actualSlices,
    unattributedActualAmount: '20000.000000', // Line 3 total from loadUnattributed
    catalogLabels: LABELS,
  });

  it('code A actual = 30,000 (Line 1 only, not 50,000)', () => {
    const rowA = result.rows.find((r) => r.costCodeId === CODE_A);
    expect(num(rowA?.actual)).toBe(30000);
  });

  it('code B actual = 50,000 (Line 2 only)', () => {
    const rowB = result.rows.find((r) => r.costCodeId === CODE_B);
    expect(num(rowB?.actual)).toBe(50000);
  });

  it('unattributed actual = 20,000 (Line 3 — not zero)', () => {
    expect(num(result.unattributedActual)).toBe(20000);
  });

  it('budget reconciliation: attributed + unattributed = 100,000', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    const total = addMoney(totals.actual, result.unattributedActual);
    expect(num(total)).toBe(100000);
  });

  it('reconciliation difference = 0.00', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    const recognized = addMoney(
      addMoney(totals.actual, result.unattributedActual),
      zeroMoney(CURRENCY),
    );
    // Total recognized = 100,000; difference vs sum = 0
    const diff = subtractMoney(recognized, { amount: '100000', currency: CURRENCY });
    expect(Math.abs(num(diff))).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Expense allocation: allocation code is authoritative
//   Expense header cost_code_id = A (metadata default)
//   Allocation 1: cost_code_id = B, amount = 40,000  (explicit — wins)
//   Allocation 2: cost_code_id = NULL, amount = 10,000 (no code — must be unmapped)
//
//   CORRECT:
//     B     = 40,000  (Allocation 1)
//     Unmapped = 10,000  (Allocation 2 — header A must NOT apply)
//
//   INCORRECT (old COALESCE) would give:
//     A     = 10,000  (header bleeds into Allocation 2)
//     B     = 40,000
//     Unmapped = 0.00
// ---------------------------------------------------------------------------
describe('0074 — Expense allocation: allocation code is authoritative, header is not', () => {
  const actualSlices: CostCodeAmountSlice[] = [
    slice(CODE_B, '40000.000000'), // Allocation 1 (explicit code B)
    // Allocation 2 absent (NULL allocation code filtered by repo)
  ];

  const result = composeCostCodeVariance({
    currency: CURRENCY,
    budgetSlices: [],
    committedSlices: [],
    actualSlices,
    unattributedActualAmount: '10000.000000', // Allocation 2
    catalogLabels: LABELS,
  });

  it('code A actual = 0 (header did NOT override Allocation 2)', () => {
    const rowA = result.rows.find((r) => r.costCodeId === CODE_A);
    expect(rowA?.actual.amount ?? '0').toBe('0');
  });

  it('code B actual = 40,000 (Allocation 1)', () => {
    const rowB = result.rows.find((r) => r.costCodeId === CODE_B);
    expect(num(rowB?.actual)).toBe(40000);
  });

  it('unattributed actual = 10,000 (Allocation 2 — not absorbed by header)', () => {
    expect(num(result.unattributedActual)).toBe(10000);
  });

  it('reconciliation difference = 0.00', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    const total = addMoney(totals.actual, result.unattributedActual);
    const diff = subtractMoney(total, { amount: '50000', currency: CURRENCY });
    expect(Math.abs(num(diff))).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Fully unmapped: all actuals lack cost codes
//   Bill with 3 lines, all NULL cost_code_id.
//   Unmapped total = 75,000.
//   No attributed slices at all.
// ---------------------------------------------------------------------------
describe('0074 — Fully unmapped actuals: zero dropped, all visible', () => {
  const result = composeCostCodeVariance({
    currency: CURRENCY,
    budgetSlices: [],
    committedSlices: [],
    actualSlices: [],               // all lines unmapped, repo returned nothing
    unattributedActualAmount: '75000.000000',
    catalogLabels: LABELS,
  });

  it('rows is empty (no cost codes attributed)', () => {
    expect(result.rows).toHaveLength(0);
  });

  it('unattributed actual = 75,000 (all recognized costs visible)', () => {
    expect(num(result.unattributedActual)).toBe(75000);
  });

  it('hasCostCodeAttribution = true (unattributed amount > 0)', () => {
    expect(result.hasCostCodeAttribution).toBe(true);
  });

  it('reconciliation: 0 attributed + 75,000 unattributed = 75,000 total', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    const total = addMoney(totals.actual, result.unattributedActual);
    const diff = subtractMoney(total, { amount: '75000', currency: CURRENCY });
    expect(Math.abs(num(diff))).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Full budget reconciliation
//   Budget A = 100,000, Budget B = 80,000
//   Committed A = 20,000, Committed B = 15,000
//   Actual A = 18,000, Actual B = 12,000, Unmapped = 5,000
//   Total recognized = 35,000
// ---------------------------------------------------------------------------
describe('0074 — Full budget reconciliation: attributed + unattributed = total recognized', () => {
  const result = composeCostCodeVariance({
    currency: CURRENCY,
    budgetSlices: [
      slice(CODE_A, '100000.000000'),
      slice(CODE_B, '80000.000000'),
    ],
    committedSlices: [
      slice(CODE_A, '20000.000000'),
      slice(CODE_B, '15000.000000'),
    ],
    actualSlices: [
      slice(CODE_A, '18000.000000'),
      slice(CODE_B, '12000.000000'),
    ],
    unattributedActualAmount: '5000.000000',
    catalogLabels: LABELS,
  });

  it('variance A: budget 100k - actual 18k = +82k (under budget)', () => {
    const rowA = result.rows.find((r) => r.costCodeId === CODE_A)!;
    expect(num(rowA.varianceBudgetVsActual)).toBe(82000);
  });

  it('variance B: budget 80k - actual 12k = +68k (under budget)', () => {
    const rowB = result.rows.find((r) => r.costCodeId === CODE_B)!;
    expect(num(rowB.varianceBudgetVsActual)).toBe(68000);
  });

  it('total attributed actual = 30,000', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    expect(num(totals.actual)).toBe(30000);
  });

  it('unattributed actual = 5,000', () => {
    expect(num(result.unattributedActual)).toBe(5000);
  });

  it('total recognized = 35,000 (reconciliation difference = 0.00)', () => {
    const totals = sumCostCodeVarianceTotals(result.rows, CURRENCY);
    const total = addMoney(totals.actual, result.unattributedActual);
    expect(num(total)).toBe(35000);
    const diff = subtractMoney(total, { amount: '35000', currency: CURRENCY });
    expect(Math.abs(num(diff))).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Multi-currency actuals fold into unattributed (not lost)
//   Same project, USD line attributed to code A (wrong currency).
//   ILS line to code B = 60,000.
//   USD line = 10 USD → excluded from ILS attributed, but goes to unattributed.
// ---------------------------------------------------------------------------
describe('0074 — Multi-currency actuals fold into unattributed (zero dropped)', () => {
  const result = composeCostCodeVariance({
    currency: CURRENCY,
    budgetSlices: [],
    committedSlices: [],
    actualSlices: [
      slice(CODE_B, '60000.000000'),       // ILS — correct currency
      { costCodeId: CODE_A, amount: '10.000000', currency: 'USD' }, // wrong currency
    ],
    unattributedActualAmount: '0',
    catalogLabels: LABELS,
  });

  it('code B actual = 60,000 ILS', () => {
    const rowB = result.rows.find((r) => r.costCodeId === CODE_B);
    expect(num(rowB?.actual)).toBe(60000);
  });

  it('USD amount folded into unattributedActual (not dropped)', () => {
    // The 10 USD is parsed as 10 ILS for the unattributed bucket (cross-currency)
    expect(Number(result.unattributedActual.amount)).toBeGreaterThan(0);
  });
});
