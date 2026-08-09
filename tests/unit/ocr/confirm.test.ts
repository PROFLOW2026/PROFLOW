import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  buildFixtureCandidates,
  confirmReceiptExtraction,
  mapConfirmedFieldsToExpenseDraft,
  StubOcrProvider,
} from '@/modules/ocr';

describe('OCR confirmation gate', () => {
  it('refuses to confirm with zero accepted fields', () => {
    expect(() =>
      confirmReceiptExtraction({
        candidates: buildFixtureCandidates(),
        acceptedFields: [],
      }),
    ).toThrow(DomainRuleError);
  });

  it('maps only explicitly accepted fields and never marks ledger truth', () => {
    const confirmed = confirmReceiptExtraction({
      candidates: buildFixtureCandidates(),
      acceptedFields: ['vendor', 'gross', 'currency'],
      overrides: { gross: '120' },
    });

    expect(confirmed.vendor).toBe('Fixture Supplies Ltd');
    expect(confirmed.gross).toBe('120');
    expect(confirmed.currency).toBe('ILS');
    expect(confirmed.net).toBeNull();
    expect(confirmed.tax).toBeNull();
    expect(confirmed.dueDate).toBeNull();
    expect(confirmed.description).toBeNull();

    const draft = mapConfirmedFieldsToExpenseDraft(confirmed);
    expect(draft.isLedgerTruth).toBe(false);
    expect(draft.grossAmount).toBe('120');
    expect(draft.projectId).toBeNull();
    expect(draft.costCategoryId).toBeNull();
  });

  it('stub provider without credentials does not invent extraction', async () => {
    const provider = new StubOcrProvider(false);
    const result = await provider.extractReceipt({ organizationId: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('not_configured');
    }
  });

  it('configured stub still does not fabricate amounts', async () => {
    const provider = new StubOcrProvider(true);
    const result = await provider.extractReceipt({ organizationId: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('empty_result');
    }
  });
});
