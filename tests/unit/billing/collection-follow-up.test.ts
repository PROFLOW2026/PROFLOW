import { describe, expect, it } from 'vitest';
import {
  COLLECTION_FOLLOW_UP_COLUMNS,
  COLLECTION_NOTE_MAX_LENGTH,
  canIssueInternalCreditNote,
  collectionFollowUpColumnSet,
  collectionPatchTouchesFinancialFields,
  isCollectionFollowUpColumnSet,
  showsCollectionFollowUp,
  validateCollectionFollowUp,
} from '@/modules/billing/domain/collection-follow-up';
import { updateCollectionFollowUpSchema } from '@/modules/billing/validation/schemas';

const billingId = '01900000-0000-7000-8000-000000000001';

describe('collection follow-up validation', () => {
  it('normalizes empty dates and a blank note to null', () => {
    const result = validateCollectionFollowUp({
      collectionContactedAt: '',
      collectionNextFollowUpAt: '  ',
      collectionPromiseToPayDate: null,
      collectionNote: '   ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      collectionContactedAt: null,
      collectionNextFollowUpAt: null,
      collectionPromiseToPayDate: null,
      collectionNote: null,
    });
  });

  it('keeps a valid follow-up and trims the note', () => {
    const result = validateCollectionFollowUp({
      collectionContactedAt: '2026-09-01',
      collectionNextFollowUpAt: '2026-09-15',
      collectionPromiseToPayDate: '2026-09-20',
      collectionNote: '  called the client  ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        collectionContactedAt: '2026-09-01',
        collectionNextFollowUpAt: '2026-09-15',
        collectionPromiseToPayDate: '2026-09-20',
        collectionNote: 'called the client',
      },
    });
  });

  it('rejects an impossible date and an oversized note', () => {
    const result = validateCollectionFollowUp({
      collectionContactedAt: '2026-02-31',
      collectionNextFollowUpAt: '15/09/2026',
      collectionPromiseToPayDate: '2026-09-20',
      collectionNote: 'x'.repeat(COLLECTION_NOTE_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'collectionContactedAt',
      'collectionNextFollowUpAt',
      'collectionNote',
    ]);
    expect(result.issues[0]?.message).toBe('billing.errors.collectionDateInvalid');
    expect(result.issues[2]?.message).toBe('billing.errors.collectionNoteTooLong');
  });

  it('writes only the four collection columns', () => {
    const patch = collectionFollowUpColumnSet({
      collectionContactedAt: '2026-09-01',
      collectionNextFollowUpAt: null,
      collectionPromiseToPayDate: null,
      collectionNote: 'note',
    });
    const keys = Object.keys(patch);
    expect(keys).toEqual([...COLLECTION_FOLLOW_UP_COLUMNS]);
    expect(isCollectionFollowUpColumnSet(keys)).toBe(true);
    expect(collectionPatchTouchesFinancialFields(keys)).toBe(false);
    expect(collectionPatchTouchesFinancialFields(['totalAmount', 'dueDate', 'vatMode', 'status'])).toBe(
      true,
    );
  });

  it('schema rejects a bad date and accepts a follow-up payload', () => {
    const invalid = updateCollectionFollowUpSchema.safeParse({
      billingRecordId: billingId,
      collectionContactedAt: '2026-02-31',
      collectionNextFollowUpAt: null,
      collectionPromiseToPayDate: null,
      collectionNote: null,
    });
    expect(invalid.success).toBe(false);

    const valid = updateCollectionFollowUpSchema.safeParse({
      billingRecordId: billingId,
      collectionContactedAt: '',
      collectionNextFollowUpAt: '2026-09-15',
      collectionPromiseToPayDate: null,
      collectionNote: '  promised Friday  ',
    });
    expect(valid.success).toBe(true);
    if (!valid.success) return;
    expect(Object.keys(valid.data).sort()).toEqual(
      ['billingRecordId', ...COLLECTION_FOLLOW_UP_COLUMNS].sort(),
    );
    expect(valid.data).not.toHaveProperty('totalAmount');
    expect(valid.data).not.toHaveProperty('dueDate');
    expect(valid.data).not.toHaveProperty('status');
    expect(valid.data).not.toHaveProperty('vatMode');
  });
});

describe('collection and credit-note eligibility', () => {
  it('shows follow-up only for a finalized non-credit record that is still open', () => {
    expect(
      showsCollectionFollowUp({ status: 'finalized', kind: 'invoice', collectionStatus: 'overdue' }),
    ).toBe(true);
    expect(
      showsCollectionFollowUp({ status: 'finalized', kind: 'invoice', collectionStatus: 'open' }),
    ).toBe(true);
    expect(
      showsCollectionFollowUp({ status: 'finalized', kind: 'advance', collectionStatus: 'partial' }),
    ).toBe(true);
    expect(
      showsCollectionFollowUp({ status: 'finalized', kind: 'invoice', collectionStatus: 'paid' }),
    ).toBe(false);
    expect(
      showsCollectionFollowUp({ status: 'draft', kind: 'invoice', collectionStatus: 'open' }),
    ).toBe(false);
    expect(
      showsCollectionFollowUp({ status: 'void', kind: 'invoice', collectionStatus: 'overdue' }),
    ).toBe(false);
    expect(
      showsCollectionFollowUp({
        status: 'finalized',
        kind: 'credit_note',
        collectionStatus: 'overdue',
      }),
    ).toBe(false);
  });

  it('allows an internal credit note on a finalized non-credit record', () => {
    expect(canIssueInternalCreditNote({ status: 'finalized', kind: 'invoice' })).toBe(true);
    expect(canIssueInternalCreditNote({ status: 'finalized', kind: 'advance' })).toBe(true);
    expect(canIssueInternalCreditNote({ status: 'finalized', kind: 'credit_note' })).toBe(false);
    expect(canIssueInternalCreditNote({ status: 'draft', kind: 'invoice' })).toBe(false);
    expect(canIssueInternalCreditNote({ status: 'void', kind: 'invoice' })).toBe(false);
  });
});
