import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import {
  assertGeneratedEntityIsDraft,
  billingInputFromPayload,
  expenseInputFromPayload,
  stripFinalizeFlag,
  vendorBillDraftInsertFromPayload,
} from '@/modules/recurring-drafts/domain/payload';

const GENERATE_SOURCE = readFileSync(
  join(process.cwd(), 'src/modules/recurring-drafts/application/generate.ts'),
  'utf8',
);

describe('recurring draft payload - drafts only', () => {
  it('strips finalize so stored templates cannot auto-post', () => {
    expect(stripFinalizeFlag({ amount: '100', finalize: true })).toEqual({ amount: '100' });
    expect(stripFinalizeFlag({ finalize: false, projectId: 'p' })).toEqual({ projectId: 'p' });
  });

  it('billing create input always sets finalize: false', () => {
    const input = billingInputFromPayload(
      {
        projectId: '01900000-0000-7000-8000-0000000000aa',
        amount: '250.00',
        currency: 'ILS',
      },
      businessDate('2026-04-01'),
    );
    expect(input.finalize).toBe(false);
    expect(input.issueDate).toBe('2026-04-01');
  });

  it('vendor bill insert is draft and never recognized actual', () => {
    const insert = vendorBillDraftInsertFromPayload(
      {
        vendorId: '01900000-0000-7000-8000-0000000000bb',
        currency: 'ils',
        totalAmount: '80.00',
        lines: [
          {
            description: 'Rent',
            quantity: '1',
            unitAmount: '80.00',
            lineTotal: '80.00',
            currency: 'ILS',
          },
        ],
      },
      businessDate('2026-04-01'),
      'Office rent',
    );
    expect(insert.status).toBe('draft');
    expect(insert.recognizedVendorActual).toBe(false);
    expect(insert.lines.every((line) => line.purchaseOrderLineId === null)).toBe(true);
  });

  it('expense input uses the run date and does not mark a template', () => {
    const input = expenseInputFromPayload(
      { amount: '40', currency: 'ILS', description: 'Software' },
      businessDate('2026-04-01'),
    );
    expect(input.expenseDate).toBe('2026-04-01');
    expect(input).not.toHaveProperty('status');
    expect(input).not.toHaveProperty('finalize');
  });

  it('rejects generated entities that are not drafts', () => {
    expect(() =>
      assertGeneratedEntityIsDraft({ kind: 'vendor_bill', status: 'open' }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertGeneratedEntityIsDraft({ kind: 'expense', status: 'finalized' }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertGeneratedEntityIsDraft({ kind: 'billing_record', status: 'finalized' }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertGeneratedEntityIsDraft({ kind: 'expense', status: 'draft' }),
    ).not.toThrow();
  });

  it('generate application creates drafts first; expense finalize is gated', () => {
    expect(GENERATE_SOURCE).not.toMatch(/createApBill\b/);
    expect(GENERATE_SOURCE).not.toMatch(/postApBill\b/);
    expect(GENERATE_SOURCE).not.toMatch(/finalizeBillingRecord\b/);
    expect(GENERATE_SOURCE).toMatch(/status: 'draft'/);
    expect(GENERATE_SOURCE).toMatch(/finalize: false/);
    expect(GENERATE_SOURCE).toMatch(/insertApBill/);
    expect(GENERATE_SOURCE).toMatch(/createExpense/);
    expect(GENERATE_SOURCE).toMatch(/createBillingRecord/);
    expect(GENERATE_SOURCE).toMatch(/autoFinalizeExpense/);
    expect(GENERATE_SOURCE).toMatch(/finalizeExpense/);
    expect(GENERATE_SOURCE).toMatch(/isMonthClosed/);
  });
});
