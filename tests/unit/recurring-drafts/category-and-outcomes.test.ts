import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { expenseInputFromPayload } from '@/modules/recurring-drafts/domain/payload';
import {
  emptyHistoryOutcomeSummary,
  summarizeOccurrenceOutcomes,
} from '@/modules/recurring-drafts/domain/occurrence-outcome';
import { parseStoredPayloadLenient } from '@/modules/recurring-drafts/application/parse-payload';
import {
  hasExplicitRecurringCategory,
  resolveAutoFinalizeFromCreationMode,
} from '@/modules/recurring-drafts/application/resolve-expense-category';

const GENERATE_SOURCE = readFileSync(
  join(process.cwd(), 'src/modules/recurring-drafts/application/generate.ts'),
  'utf8',
);
const RESOLVE_CATEGORY_SOURCE = readFileSync(
  join(process.cwd(), 'src/modules/recurring-drafts/application/resolve-expense-category.ts'),
  'utf8',
);

const BITUACH_CATEGORY_ID = '01900000-0000-7000-8000-00000000c401';

describe('recurring expense explicit category', () => {
  it('requires an explicit category id on the definition payload', () => {
    expect(hasExplicitRecurringCategory({ amount: '800', currency: 'ILS' })).toBe(false);
    expect(
      hasExplicitRecurringCategory({
        amount: '800',
        currency: 'ILS',
        costCategoryId: BITUACH_CATEGORY_ID,
      }),
    ).toBe(true);
    expect(
      hasExplicitRecurringCategory({
        amount: '800',
        currency: 'ILS',
        costCategoryId: '   ',
      }),
    ).toBe(false);
  });

  it('preserves category and zero VAT into every generated expense input', () => {
    const months = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-08-01'] as const;
    for (const month of months) {
      const input = expenseInputFromPayload(
        {
          amount: '800',
          currency: 'ILS',
          vatMode: 'zero',
          costCategoryId: BITUACH_CATEGORY_ID,
        },
        businessDate(month),
      );
      expect(input.amount).toBe('800');
      expect(input.vatMode).toBe('zero');
      expect(input.costCategoryId).toBe(BITUACH_CATEGORY_ID);
      expect(input.expenseDate).toBe(month);
    }
  });

  it('does not auto-pick a category from catalog or heuristics', () => {
    expect(RESOLVE_CATEGORY_SOURCE).not.toMatch(/listCostCategories/);
    expect(RESOLVE_CATEGORY_SOURCE).not.toMatch(/defaultCostCategory/);
    expect(GENERATE_SOURCE).not.toMatch(/listCostCategories/);
    expect(GENERATE_SOURCE).not.toMatch(/resolveDefaultCostCategory/);
    expect(GENERATE_SOURCE).toMatch(/hasExplicitRecurringCategory/);
    expect(GENERATE_SOURCE).toMatch(/blocked_missing_category/);
  });

  it('parses legacy definitions without category without crashing', () => {
    const payload = parseStoredPayloadLenient('expense', {
      amount: '800',
      currency: 'ILS',
      supplierName: 'ביטוח',
      vatMode: 'zero',
    });
    expect(payload.kind).toBe('expense');
    if (payload.kind !== 'expense') {
      throw new Error('expected expense payload');
    }
    expect(payload.data.costCategoryId ?? null).toBeNull();
    expect(hasExplicitRecurringCategory(payload.data)).toBe(false);
  });

  it('defaults automatic creation mode to actual', () => {
    expect(resolveAutoFinalizeFromCreationMode(undefined)).toBe(true);
    expect(resolveAutoFinalizeFromCreationMode('automatic')).toBe(true);
    expect(resolveAutoFinalizeFromCreationMode('draft')).toBe(false);
  });
});

describe('recurring history outcome summary', () => {
  it('counts finalized actuals separately from closed-month blocks', () => {
    const summary = summarizeOccurrenceOutcomes([
      'finalized',
      'finalized',
      'finalized',
      'finalized',
      'finalized',
      'finalized',
      'blocked_closed',
      'blocked_closed',
    ]);
    expect(summary).toEqual({
      ...emptyHistoryOutcomeSummary(),
      finalized: 6,
      blockedClosed: 2,
    });
    expect(summary.finalized + summary.blockedClosed).toBe(8);
    expect(summary.draft).toBe(0);
  });

  it('tracks missing-category blocks without treating them as successes', () => {
    const summary = summarizeOccurrenceOutcomes(['blocked_missing_category', 'blocked_missing_category']);
    expect(summary).toEqual({
      ...emptyHistoryOutcomeSummary(),
      blockedMissingCategory: 2,
    });
    expect(summary.finalized).toBe(0);
  });
});
