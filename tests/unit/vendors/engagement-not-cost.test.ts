import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Engagement ≠ Actual: create/end/cancel vendor engagements must never touch
 * labor cost or expense Actual write paths. Locks the contract at the module
 * boundary (source + call-graph stubs).
 */

const engagementsAppPath = path.resolve(
  process.cwd(),
  'src/modules/vendors/application/manage-engagements.ts',
);
const vendorsRepoPath = path.resolve(
  process.cwd(),
  'src/modules/vendors/data/vendors.repository.ts',
);

const FORBIDDEN_APP_PATTERNS = [
  'getProjectLaborCost',
  'project-labor-cost',
  'createExpense',
  'create-expense',
  'createTimeEntry',
  'resolveTimeEntryCostSnapshot',
  'insertTimeEntry',
  'sumProjectLaborCost',
  'costAmount',
  'createVendorBill',
  'insertVendorBill',
  '@/modules/expenses',
  '@/modules/financials',
  '@/modules/ap',
  '@/modules/workforce',
];

const FORBIDDEN_REPO_PATTERNS = [
  'timeEntries',
  'insertTimeEntry',
  'costAmount',
  'laborCost',
  'insert(expenses)',
  'vendorBills',
];

describe('vendor engagement ≠ Actual', () => {
  it('manage-engagements application source does not call labor/expense/AP Actual paths', () => {
    const source = readFileSync(engagementsAppPath, 'utf8');
    for (const pattern of FORBIDDEN_APP_PATTERNS) {
      expect(source, `must not reference ${pattern}`).not.toContain(pattern);
    }
    expect(source).toContain('insertVendorEngagement');
    expect(source).toContain('Engagement alone never creates expense Actual');
    expect(source).toContain('Multiple / overlapping projects are allowed');
  });

  it('vendors repository engagement writes only vendor_engagements (not expense/labor)', () => {
    const source = readFileSync(vendorsRepoPath, 'utf8');
    expect(source).toContain('insert(vendorEngagements)');
    expect(source).toContain('Engagement ≠ cost');
    // linkExpenseToVendor updates expenses.vendorId - engagement insert path must stay clean.
    expect(source).not.toMatch(/\.insert\(expenses\)/);
    for (const pattern of FORBIDDEN_REPO_PATTERNS) {
      if (pattern === 'timeEntries') {
        expect(source).not.toContain(pattern);
        continue;
      }
      expect(source, `must not reference ${pattern}`).not.toContain(pattern);
    }
  });

  it(
    'createVendorEngagement runtime does not invoke labor/expense/AP modules',
    async () => {
    const expenses = await import('@/modules/expenses');
    const financialsPath = path.resolve(
      process.cwd(),
      'src/modules/financials/index.ts',
    );
    const financialsSource = readFileSync(financialsPath, 'utf8');

    const expenseSpy = vi.spyOn(expenses, 'createExpense');

    expect(expenseSpy).not.toHaveBeenCalled();
    expect(financialsSource).not.toContain('createVendorEngagement');
    },
    30_000,
  );

  it('createEngagementSchema accepts overlapping multi-project date spans', async () => {
    const { createEngagementSchema } = await import('@/modules/vendors/validation/schemas');

    const first = createEngagementSchema.safeParse({
      vendorId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    const second = createEngagementSchema.safeParse({
      vendorId: '11111111-1111-4111-8111-111111111111',
      projectId: '33333333-3333-4333-8333-333333333333',
      startDate: '2026-03-01',
      endDate: '2026-09-30',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const invalid = createEngagementSchema.safeParse({
      vendorId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      startDate: '2026-06-30',
      endDate: '2026-01-01',
    });
    expect(invalid.success).toBe(false);
  });
});
