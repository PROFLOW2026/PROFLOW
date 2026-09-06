import { describe, expect, it } from 'vitest';
import { recurringDraftGeneratedNote, localizeLegacyRecurringDraftNote } from '@/modules/recurring-drafts/domain/generated-note';
import { resolveExpenseAutomaticPaymentKind } from '@/modules/expenses/domain/payment-behavior';

describe('recurring draft generated notes', () => {
  it('uses Hebrew for he-IL locale', () => {
    expect(recurringDraftGeneratedNote('שכירות מחסן', 'he-IL')).toBe(
      'נוצר אוטומטית מהוצאה חוזרת "שכירות מחסן".',
    );
  });

  it('localizes legacy English note lines for Hebrew display', () => {
    expect(
      localizeLegacyRecurringDraftNote(
        'Generated from recurring draft "שכירות מחסן".',
        'he-IL',
      ),
    ).toBe('נוצר אוטומטית מהוצאה חוזרת "שכירות מחסן".');
  });

  it('does not alter user-written English notes', () => {
    const note = 'Paid by wire transfer on Tuesday';
    expect(localizeLegacyRecurringDraftNote(note, 'he-IL')).toBe(note);
  });
});

describe('template recurring automatic payment kind', () => {
  it('prefers template automatic over vendor org_default', () => {
    const kind = resolveExpenseAutomaticPaymentKind({
      automaticInstallmentPayment: false,
      installmentCount: 1,
      vendor: { paymentConfirmationOverride: 'org_default' },
      recurringDraft: { paymentConfirmationOverride: 'automatic' },
      policies: {
        expensePaymentConfirmationMode: 'manual',
        salaryPaymentConfirmationMode: 'manual',
        salaryPaymentDay: 10,
      },
    });
    expect(kind).toBe('template_recurring_automatic');
  });
});
