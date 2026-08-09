import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/documents/data/documents.repository', () => ({
  findDocumentById: vi.fn(async (_db: unknown, organizationId: string, documentId: string) => {
    if (
      organizationId === 'org-1' &&
      documentId === '01900000-0000-7000-8000-000000000001'
    ) {
      return {
        id: documentId,
        organizationId,
        status: 'available',
        deletedAt: null,
      };
    }
    return null;
  }),
}));

import {
  StubOcrProvider,
  ScriptedOcrProvider,
  applyFieldOverrides,
  buildFixtureCandidates,
  confirmOcrCandidate,
  confirmReceiptExtraction,
  extractReceiptJob,
  findJob,
  listOcrCandidates,
  mapCandidatesToExpenseInput,
  mapConfirmedFieldsToExpenseDraft,
  resetOcrStoreForTests,
  seedFixtureJob,
  validateMappedCandidates,
  setOcrProviderForTests,
  OCR_CANDIDATE_FIELD_KEYS,
} from '@/modules/ocr';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

const ALL_FIELDS = [...OCR_CANDIDATE_FIELD_KEYS];

describe('StubOcrProvider', () => {
  beforeEach(() => {
    setOcrProviderForTests(null);
  });

  it('returns not_configured without credentials', async () => {
    const provider = new StubOcrProvider(undefined);
    expect(provider.isConfigured()).toBe(false);
    const result = await provider.extractReceipt({ organizationId: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('not_configured');
    }
  });

  it('does not invent amounts even when an API key is present', async () => {
    const provider = new StubOcrProvider('test-key');
    expect(provider.isConfigured()).toBe(true);
    const result = await provider.extractReceipt({ organizationId: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('empty_result');
    }
  });

  it('ignores legacy OCR_API_KEY and stays not_configured', async () => {
    const previous = process.env.OCR_API_KEY;
    process.env.OCR_API_KEY = 'legacy-should-not-count';
    delete process.env.OCR_PROVIDER_API_KEY;
    try {
      const provider = new StubOcrProvider();
      expect(provider.isConfigured()).toBe(false);
      const result = await provider.extractReceipt({ organizationId: 'org-1' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe('not_configured');
    } finally {
      if (previous === undefined) delete process.env.OCR_API_KEY;
      else process.env.OCR_API_KEY = previous;
    }
  });
});

describe('field mapping validation', () => {
  it('accepts fixture candidates and maps to expense input', () => {
    const candidates = buildFixtureCandidates();
    const issues = validateMappedCandidates(candidates);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);

    const { input } = mapCandidatesToExpenseInput(candidates);
    expect(input.amount).toBe('117.00');
    expect(input.currency).toBe('ILS');
    expect(input.supplierName).toBe('Fixture Supplies Ltd');
    expect(input.netAmount).toBe('100.00');
    expect(input.taxAmount).toBe('17.00');
    expect(input.projectId).toBeNull();
    expect(input.costCategoryId).toBeNull();
  });

  it('never maps project/category suggestions into IDs', () => {
    const candidates = buildFixtureCandidates();
    expect(candidates.suggestions.projectLabel?.value).toBe('HQ Refresh');
    expect(candidates.suggestions.categoryLabel?.value).toBe('Office');
    const { input } = mapCandidatesToExpenseInput(candidates);
    expect(input.projectId).toBeNull();
    expect(input.costCategoryId).toBeNull();
  });

  it('rejects missing amount and bad currency', () => {
    const blank = buildFixtureCandidates();
    const broken = {
      ...blank,
      gross: { ...blank.gross, value: null },
      net: { ...blank.net, value: null },
      currency: { ...blank.currency, value: 'IL' },
    };
    const issues = validateMappedCandidates(broken);
    expect(issues.some((i) => i.field === 'amount')).toBe(true);
    expect(issues.some((i) => i.field === 'currency')).toBe(true);
    expect(() => mapCandidatesToExpenseInput(broken)).toThrow(ValidationError);
  });

  it('applies user overrides for mapping with user_override provenance', () => {
    const candidates = buildFixtureCandidates();
    const merged = applyFieldOverrides(candidates, {
      vendor: 'Manual Vendor',
      gross: '50.00',
    });
    expect(merged.vendor.provenance.source).toBe('user_override');
    expect(merged.gross.provenance.source).toBe('user_override');
    expect(merged.date.provenance.source).toBe('fixture');

    const { input } = mapCandidatesToExpenseInput(candidates, {
      vendor: 'Manual Vendor',
      gross: '50.00',
    });
    expect(input.supplierName).toBe('Manual Vendor');
    expect(input.amount).toBe('50.00');
  });
});

describe('confirm path never creates expense without confirm', () => {
  beforeEach(() => {
    resetOcrStoreForTests();
  });

  it('refuses when no fields are accepted', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates(),
    });
    const createExpense = vi.fn(async () => ({ id: 'expense-should-not-exist' }));

    await expect(
      confirmOcrCandidate(
        ctx,
        { jobId: job.id, confirm: false, acceptedFields: [] },
        { createExpense },
      ),
    ).rejects.toThrow();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('returns mapped payload when confirm is false and does not call createExpense', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates(),
    });

    const createExpense = vi.fn(async () => ({ id: 'expense-should-not-exist' }));

    const result = await confirmOcrCandidate(
      ctx,
      { jobId: job.id, confirm: false, acceptedFields: ALL_FIELDS },
      { createExpense },
    );

    expect(result.kind).toBe('mapped');
    expect(createExpense).not.toHaveBeenCalled();
    expect(result.draft.isLedgerTruth).toBe(false);
    if (result.kind === 'mapped') {
      expect(result.expenseInput?.amount).toBe('117.00');
      expect(result.expenseInput?.projectId).toBeNull();
      expect(result.expenseInput?.costCategoryId).toBeNull();
    }
  });

  it('allows preview with partial accepted fields without calling createExpense', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates(),
    });
    const createExpense = vi.fn(async () => ({ id: 'expense-should-not-exist' }));

    const result = await confirmOcrCandidate(
      ctx,
      { jobId: job.id, confirm: false, acceptedFields: ['vendor'] },
      { createExpense },
    );

    expect(result.kind).toBe('mapped');
    expect(createExpense).not.toHaveBeenCalled();
    expect(result.draft.vendorName).toBe('Fixture Supplies Ltd');
    expect(result.draft.isLedgerTruth).toBe(false);
    if (result.kind === 'mapped') {
      expect(result.expenseInput).toBeNull();
    }
  });

  it('retains review corrections and original extracted provenance', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const original = buildFixtureCandidates();
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: original,
      filename: 'receipt-scan.pdf',
      mimeType: 'application/pdf',
    });

    const createExpense = vi.fn(async () => ({ id: 'expense-should-not-exist' }));

    const result = await confirmOcrCandidate(
      ctx,
      {
        jobId: job.id,
        confirm: false,
        acceptedFields: ['vendor', 'gross', 'currency'],
        fieldOverrides: { vendor: 'Corrected Vendor', gross: '99.00' },
      },
      { createExpense },
    );

    expect(result.kind).toBe('mapped');
    expect(createExpense).not.toHaveBeenCalled();

    const stored = findJob(ctx.organizationId, job.id);
    expect(stored).not.toBeNull();
    expect(stored!.sourceDocument.filename).toBe('receipt-scan.pdf');
    expect(stored!.reviewOverrides?.vendor).toBe('Corrected Vendor');
    expect(stored!.reviewOverrides?.gross).toBe('99.00');
    expect(stored!.extractedCandidates?.vendor.value).toBe(original.vendor.value);
    expect(stored!.extractedCandidates?.vendor.provenance.source).toBe('fixture');
    expect(stored!.candidates?.vendor.value).toBe('Corrected Vendor');
    expect(stored!.candidates?.vendor.provenance.source).toBe('user_override');
    expect(stored!.confirmedExpenseId).toBeNull();
  });

  it('calls createExpense only when confirm is true and still is not ledger truth', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates(),
    });

    const createExpense = vi.fn(async (_ctx, input) => {
      // CreateExpenseInput has no status — application always inserts draft.
      expect(input).not.toHaveProperty('status', 'finalized');
      expect(input.projectId).toBeNull();
      expect(input.costCategoryId).toBeNull();
      return { id: 'expense-1' };
    });

    const result = await confirmOcrCandidate(
      ctx,
      { jobId: job.id, confirm: true, acceptedFields: ALL_FIELDS },
      { createExpense },
    );

    expect(result.kind).toBe('created');
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(result.draft.isLedgerTruth).toBe(false);
    if (result.kind === 'created') {
      expect(result.expenseId).toBe('expense-1');
      expect(result.job.confirmedExpenseId).toBe('expense-1');
      expect(result.job.status).toBe('succeeded');
      expect(result.expenseInput.projectId).toBeNull();
      expect(result.expenseInput.costCategoryId).toBeNull();
    }
  });

  it('refuses confirm:true when accepted fields cannot form an expense draft', async () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const job = seedFixtureJob({
      organizationId: ctx.organizationId,
      candidates: buildFixtureCandidates(),
    });
    const createExpense = vi.fn(async () => ({ id: 'expense-should-not-exist' }));

    await expect(
      confirmOcrCandidate(
        ctx,
        { jobId: job.id, confirm: true, acceptedFields: ['vendor'] },
        { createExpense },
      ),
    ).rejects.toThrow();
    expect(createExpense).not.toHaveBeenCalled();
    expect(findJob(ctx.organizationId, job.id)?.confirmedExpenseId).toBeNull();
  });

  it('never auto-creates an expense from extraction alone', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new StubOcrProvider(undefined);
    const job = await extractReceiptJob(
      ctx,
      { filename: 'scan.png', mimeType: 'image/png' },
      provider,
    );
    expect(job.status).toBe('failed');
    expect(job.confirmedExpenseId).toBeNull();
    expect(job.sourceDocument.filename).toBe('scan.png');
  });
});

describe('domain confirm helpers', () => {
  it('refuses mapping without accepted fields and never marks ledger truth', () => {
    const candidates = buildFixtureCandidates();
    expect(() =>
      confirmReceiptExtraction({ candidates, acceptedFields: [] }),
    ).toThrow(DomainRuleError);

    const confirmed = confirmReceiptExtraction({
      candidates,
      acceptedFields: ['vendor', 'gross', 'currency'],
      overrides: { vendor: 'Accepted Vendor' },
    });
    const draft = mapConfirmedFieldsToExpenseDraft(confirmed);
    expect(draft.isLedgerTruth).toBe(false);
    expect(draft.vendorName).toBe('Accepted Vendor');
    expect(draft.grossAmount).toBe('117.00');
    expect(draft.netAmount).toBeNull();
  });
});

describe('extractReceiptJob with stub', () => {
  beforeEach(() => {
    resetOcrStoreForTests();
  });

  it('marks job failed when provider is not configured and retains source document', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new StubOcrProvider(undefined);
    const job = await extractReceiptJob(
      ctx,
      { filename: 'invoice.pdf', mimeType: 'application/pdf' },
      provider,
    );
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('not_configured');
    expect(job.candidates).toBeNull();
    expect(job.extractedCandidates).toBeNull();
    expect(job.confirmedExpenseId).toBeNull();
    expect(job.sourceDocument.filename).toBe('invoice.pdf');
    expect(job.sourceDocument.mimeType).toBe('application/pdf');
  });

  it('configured stub still fails empty without inventing candidates', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new StubOcrProvider(true);
    const job = await extractReceiptJob(ctx, { filename: 'blank.pdf' }, provider);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('empty_result');
    expect(job.candidates).toBeNull();
    expect(job.confirmedExpenseId).toBeNull();
  });

  it('rejects documentId that does not belong to the active organization', async () => {
    const ctx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE]);
    const provider = new ScriptedOcrProvider(buildFixtureCandidates());
    await expect(
      extractReceiptJob(
        ctx,
        { documentId: '01900000-0000-7000-8000-000000000099', filename: 'x.pdf' },
        provider,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('end-to-end extract → review → confirm draft', () => {
  beforeEach(() => {
    resetOcrStoreForTests();
  });

  it('scripted provider yields needs_review candidates then draft only on confirm', async () => {
    const manageCtx = contextWith([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_READ]);
    const expenseCtx = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const candidates = buildFixtureCandidates({
      vendor: 'Scripted Vendor',
      gross: '200.00',
      currency: 'ILS',
    });
    // Scripted provider is a test double — not the production stub inventing OCR.
    const provider = new ScriptedOcrProvider(candidates);

    const extracted = await extractReceiptJob(
      manageCtx,
      {
        documentId: '01900000-0000-7000-8000-000000000001',
        filename: 'scripted-receipt.png',
        mimeType: 'image/png',
      },
      provider,
    );

    expect(extracted.status).toBe('needs_review');
    expect(extracted.confirmedExpenseId).toBeNull();
    expect(extracted.candidates?.vendor.value).toBe('Scripted Vendor');
    expect(extracted.candidates?.vendor.confidence).toBe(0.9);
    expect(extracted.candidates?.vendor.provenance.source).toBe('fixture');
    expect(extracted.extractedCandidates?.vendor.value).toBe('Scripted Vendor');
    expect(extracted.sourceDocument.documentId).toBe('01900000-0000-7000-8000-000000000001');
    expect(extracted.sourceDocument.filename).toBe('scripted-receipt.png');

    const queue = listOcrCandidates(manageCtx, { status: 'needs_review' });
    expect(queue.some((job) => job.id === extracted.id)).toBe(true);

    const createExpense = vi.fn(async () => ({ id: 'draft-expense-99' }));

    const preview = await confirmOcrCandidate(
      expenseCtx,
      {
        jobId: extracted.id,
        confirm: false,
        acceptedFields: ['vendor', 'gross', 'currency', 'date'],
        fieldOverrides: { vendor: 'Corrected Scripted Vendor' },
      },
      { createExpense },
    );
    expect(preview.kind).toBe('mapped');
    expect(createExpense).not.toHaveBeenCalled();
    expect(preview.draft.isLedgerTruth).toBe(false);

    const afterPreview = findJob(manageCtx.organizationId, extracted.id);
    expect(afterPreview?.reviewOverrides?.vendor).toBe('Corrected Scripted Vendor');
    expect(afterPreview?.extractedCandidates?.vendor.value).toBe('Scripted Vendor');
    expect(afterPreview?.candidates?.vendor.provenance.source).toBe('user_override');
    expect(afterPreview?.confirmedExpenseId).toBeNull();
    expect(afterPreview?.status).toBe('needs_review');

    const confirmed = await confirmOcrCandidate(
      expenseCtx,
      {
        jobId: extracted.id,
        confirm: true,
        acceptedFields: ['vendor', 'gross', 'currency', 'date', 'net', 'tax', 'description'],
        fieldOverrides: { vendor: 'Corrected Scripted Vendor' },
      },
      { createExpense },
    );

    expect(confirmed.kind).toBe('created');
    expect(createExpense).toHaveBeenCalledTimes(1);
    if (confirmed.kind === 'created') {
      expect(confirmed.expenseId).toBe('draft-expense-99');
      expect(confirmed.expenseInput.supplierName).toBe('Corrected Scripted Vendor');
      expect(confirmed.expenseInput.amount).toBe('200.00');
      expect(confirmed.expenseInput.projectId).toBeNull();
      expect(confirmed.draft.isLedgerTruth).toBe(false);
      expect(confirmed.job.status).toBe('succeeded');
      expect(confirmed.job.confirmedExpenseId).toBe('draft-expense-99');
    }
  });
});
