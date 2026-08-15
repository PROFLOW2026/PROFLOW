import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import enCommon from '@/locales/en/common.json';
import enDocuments from '@/locales/en/documents.json';
import { buildFixtureCandidates } from '@/modules/ocr';
import { OcrReviewPanel } from '@/modules/ocr/ui/ocr-review-panel';
import type { ExtractionJob, OcrProviderStatus } from '@/modules/ocr/domain/types';

vi.mock('@/modules/ocr/application/ocr-actions', () => ({
  confirmOcrCandidateAction: vi.fn(async () => ({
    ok: true,
    data: {
      kind: 'created',
      draftTarget: 'expense',
      expenseId: 'exp-draft-1',
      job: {
        ...baseJob(),
        status: 'succeeded',
        reviewStatus: 'accepted',
        confirmedExpenseId: 'exp-draft-1',
      },
    },
  })),
  extractReceiptAction: vi.fn(),
  rejectOcrCandidateAction: vi.fn(),
  seedFixtureOcrJobAction: vi.fn(),
  cancelOcrJobAction: vi.fn(),
  createOcrBatchAction: vi.fn(),
  getOcrReviewPageDataAction: vi.fn(async () => ({ ok: false, error: 'not polled in unit test' })),
  getOcrReviewSuggestionsAction: vi.fn(async () => ({
    ok: true,
    data: { projects: [], purchaseOrders: [], subcontractAgreements: [] },
  })),
}));

vi.mock('@/modules/documents/application/document-actions', () => ({
  prepareDocumentUploadAction: vi.fn(),
  finalizeDocumentUploadAction: vi.fn(),
  softDeleteDocumentAction: vi.fn(async () => ({})),
  downloadDocumentAction: vi.fn(async ({ documentId }: { documentId: string }) => ({
    url: `https://signed.example/${documentId}.jpg`,
    filename: `${documentId}.jpg`,
  })),
}));

vi.mock('@/modules/documents/client/upload-document-bytes', () => ({
  uploadDocumentBytes: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const DOCUMENT_ID = '01900000-0000-7000-8000-0000000000d1';
const VENDOR_ID = '01900000-0000-7000-8000-0000000000aa';

function baseJob(): ExtractionJob {
  const now = '2026-08-12T00:00:00.000Z';
  return {
    id: '01900000-0000-7000-8000-0000000000j1',
    organizationId: 'org-1',
    documentId: DOCUMENT_ID,
    sourceDocument: {
      documentId: DOCUMENT_ID,
      filename: 'receipt.png',
      mimeType: 'image/png',
    },
    status: 'needs_review',
    reviewStatus: 'awaiting_review',
    candidates: buildFixtureCandidates(),
    extractedCandidates: buildFixtureCandidates(),
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: {
      providerId: 'scripted',
      documentTypeKey: 'tax_invoice',
      vendorMatches: [
        {
          vendorId: VENDOR_ID,
          vendorName: 'Fixture Supplies Ltd',
          strength: 'exact_name',
          reasonKey: 'exactName',
        },
      ],
      duplicateHits: [
        { kind: 'probable_document', reasonKeys: ['vendorName', 'reference'] },
      ],
    },
    overallConfidence: 0.9,
    errorCode: null,
    errorMessage: null,
    providerId: 'scripted',
    confirmedExpenseId: null,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
    confirmedDraftTarget: null,
    documentVersionId: null,
    batchId: null,
    attemptCount: 0,
    lastError: null,
    idempotencyKey: null,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const liveStatus: OcrProviderStatus = {
  providerId: 'azure',
  configured: true,
  featureMode: 'live',
  ingestionEnabled: true,
  messageKey: 'providerLiveReady',
};

function acceptVendorLabel() {
  return `Accept ${enDocuments.ocr.fields.vendor}`;
}

async function acceptVendorField(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: acceptVendorLabel() }));
}

async function overrideDuplicateIfShown(user: ReturnType<typeof userEvent.setup>) {
  const override = screen.queryByRole('checkbox', { name: enDocuments.ocr.duplicateOverride });
  if (override) await user.click(override);
}

function renderPanel(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{ documents: enDocuments, common: enCommon }}
        timeZone="Asia/Jerusalem"
      >
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

describe('OCR review panel', () => {
  it('shows original document, Hebrew-friendly confidence states, vendor chooser and duplicate warning', async () => {
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[baseJob()]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    expect(document.querySelector('[data-pf-ocr-review]')).not.toBeNull();
    expect(screen.getByText(enDocuments.ocr.duplicateWarning)).toBeVisible();
    expect(screen.getByText(enDocuments.ocr.duplicateWarningTitle)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: enDocuments.ocr.duplicateOverride })).toBeVisible();
    expect(document.querySelector('[data-pf-ocr-inbox-tab="needs_review"]')).not.toBeNull();
    expect(screen.getAllByText(enDocuments.ocr.confidenceState.high).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(enDocuments.ocr.extractCapture)).toBeInTheDocument();
    expect(screen.getByLabelText(enDocuments.ocr.extractImage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enDocuments.ocr.viewOriginal })).toBeVisible();
    expect(screen.queryByText(VENDOR_ID)).toBeNull();
    expect(screen.getByDisplayValue('Fixture Supplies Ltd')).toBeInTheDocument();
  });

  it('explains live vs credentials-pending vs off without printing secrets', () => {
    const { unmount } = renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[]}
        vendors={[]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );
    expect(screen.getByText(enDocuments.ocr.configurationState.live)).toBeVisible();
    expect(screen.getByText(enDocuments.ocr.providerLiveReady)).toBeVisible();
    expect(screen.queryByText(/OCR_PROVIDER/)).toBeNull();
    unmount();

    renderPanel(
      <OcrReviewPanel
        initialStatus={{
          providerId: 'azure',
          configured: true,
          featureMode: 'configured_pending',
          ingestionEnabled: false,
          messageKey: 'providerConfiguredPending',
        }}
        initialJobs={[]}
        vendors={[]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments={false}
        canCreateExpenses={false}
        canManageAp={false}
      />,
    );
    expect(screen.getByText(enDocuments.ocr.configurationState.configured_pending)).toBeVisible();
    expect(screen.getByText(enDocuments.ocr.providerConfiguredPending)).toBeVisible();
    expect(screen.queryByText(/OCR_PROVIDER/)).toBeNull();
  });

  it('keeps camera capture on the file input and stacks original above fields in the DOM', () => {
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[baseJob()]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        defaultTarget="vendor_bill"
        workflow="vendor_bill"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    const captureInput = document.querySelector('[data-pf-ocr-capture-input]');
    const fileInput = document.querySelector('[data-pf-ocr-file-input]');
    expect(captureInput).toHaveAttribute('capture', 'environment');
    expect(fileInput?.getAttribute('capture')).toBeNull();
    expect(fileInput?.getAttribute('accept')).toMatch(/\.jpg/);
    expect(screen.getByRole('button', { name: enDocuments.ocr.extractCapture })).toBeVisible();
    expect(screen.getByRole('button', { name: enDocuments.ocr.extractImage })).toBeVisible();
    expect(screen.getByText(enDocuments.ocr.vendorExact)).toBeVisible();
    expect(screen.getByLabelText(enDocuments.ocr.vendorEntity)).toBeVisible();
    const original = document.querySelector('[data-pf-ocr-original]');
    const vendorField = screen.getByLabelText(enDocuments.ocr.fields.vendor);
    expect(original).toBeTruthy();
    expect(
      original!.compareDocumentPosition(vendorField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('confirms a draft expense only after the reviewer accepts fields', async () => {
    const user = userEvent.setup();
    const { confirmOcrCandidateAction } = await import('@/modules/ocr/application/ocr-actions');
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[baseJob()]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(confirmOcrCandidateAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: acceptVendorLabel() }));
    await user.click(screen.getByRole('checkbox', { name: enDocuments.ocr.duplicateOverride }));
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(confirmOcrCandidateAction).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(enDocuments.ocr.empty)).toBeVisible();
    });
    expect(document.querySelector('[data-pf-ocr-original]')).toBeNull();
  });

  it('rejects A then auto-selects B; approve B clears the active queue', async () => {
    const user = userEvent.setup();
    const actions = await import('@/modules/ocr/application/ocr-actions');
    const jobA = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000a1',
      sourceDocument: {
        documentId: 'doc-a',
        filename: 'alpha.jpg',
        mimeType: 'image/jpeg',
      },
    };
    const jobB = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000b1',
      sourceDocument: {
        documentId: 'doc-b',
        filename: 'bravo.jpg',
        mimeType: 'image/jpeg',
      },
    };

    vi.mocked(actions.rejectOcrCandidateAction).mockImplementation(async ({ jobId }) => ({
      ok: true as const,
      data: {
        ...jobA,
        id: jobId,
        status: 'rejected' as const,
        reviewStatus: 'rejected' as const,
      },
    }));
    vi.mocked(actions.confirmOcrCandidateAction).mockImplementation(async ({ jobId }) => ({
      ok: true as const,
      data: {
        kind: 'created' as const,
        draftTarget: 'expense' as const,
        expenseId: 'exp-draft-b',
        expenseInput: {} as never,
        job: {
          ...jobB,
          id: jobId,
          status: 'succeeded' as const,
          reviewStatus: 'accepted' as const,
          confirmedExpenseId: 'exp-draft-b',
        },
      },
    }));

    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[jobA, jobB]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-lifecycle"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    expect(document.querySelector('[data-pf-ocr-job-id="01900000-0000-7000-8000-0000000000a1"]')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.rejectReview }));
    await waitFor(() => {
      expect(
        document.querySelector('[data-pf-ocr-job-id="01900000-0000-7000-8000-0000000000a1"]'),
      ).toBeNull();
    });
    expect(
      document
        .querySelector('[data-pf-ocr-job-id="01900000-0000-7000-8000-0000000000b1"]')
        ?.getAttribute('aria-current'),
    ).toBe('true');
    expect(document.querySelector('[data-pf-preview-document-id="doc-b"]')).toBeTruthy();

    // Reject uses startTransition — job removal can paint before `pending` clears.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: acceptVendorLabel() })).toBeEnabled();
      expect(screen.getByRole('button', { name: enDocuments.ocr.rejectReview })).toBeEnabled();
    });

    await user.click(screen.getByRole('checkbox', { name: acceptVendorLabel() }));
    await user.click(screen.getByRole('checkbox', { name: enDocuments.ocr.duplicateOverride }));
    const confirmBtn = screen.getByRole('button', { name: enDocuments.ocr.confirmExpense });
    await waitFor(() => {
      expect(confirmBtn).toBeEnabled();
    });
    vi.mocked(actions.confirmOcrCandidateAction).mockClear();
    await user.click(confirmBtn);
    await waitFor(
      () => {
        expect(actions.confirmOcrCandidateAction).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        expect(
          document.querySelector('[data-pf-ocr-job-id="01900000-0000-7000-8000-0000000000b1"]'),
        ).toBeNull();
        expect(screen.getByText(enDocuments.ocr.empty)).toBeVisible();
      },
      { timeout: 5000 },
    );
    expect(document.querySelector('[data-pf-ocr-original]')).toBeNull();
  });

  it('ignores terminal jobs passed into the active review panel', () => {
    const terminal = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000t1',
      status: 'succeeded' as const,
      reviewStatus: 'accepted' as const,
      confirmedExpenseId: 'exp-1',
    };
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[terminal]}
        vendors={[]}
        organizationId="org-terminal-filter"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );
    expect(screen.getByText(enDocuments.ocr.empty)).toBeVisible();
    expect(document.querySelector('[data-pf-ocr-original]')).toBeNull();
  });

  it('shows the selected job original, not a previous document', async () => {
    const user = userEvent.setup();
    const jobA = {
      ...baseJob(),
      id: 'job-a',
      sourceDocument: {
        documentId: 'doc-a',
        filename: 'alpha-red.jpg',
        mimeType: 'image/jpeg',
      },
    };
    const jobB = {
      ...baseJob(),
      id: 'job-b',
      sourceDocument: {
        documentId: 'doc-b',
        filename: 'bravo-blue.jpg',
        mimeType: 'image/jpeg',
      },
    };

    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[jobA, jobB]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    await screen.findByRole('img');
    expect(document.querySelector('[data-pf-preview-document-id="doc-a"]')).toBeTruthy();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-a.jpg');

    await user.click(screen.getByRole('button', { name: /bravo-blue/i }));
    expect(document.querySelector('[data-pf-preview-document-id="doc-b"]')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-b.jpg'),
    );

    await user.click(screen.getByRole('button', { name: /alpha-red/i }));
    expect(document.querySelector('[data-pf-preview-document-id="doc-a"]')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-a.jpg'),
    );
  });

  it('opens the desktop file picker via the attach button, not a Radix label wrapper', async () => {
    const user = userEvent.setup();
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[]}
        vendors={[]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    const fileInput = document.querySelector('[data-pf-ocr-file-input]') as HTMLInputElement;
    const captureInput = document.querySelector('[data-pf-ocr-capture-input]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(captureInput).toBeTruthy();
    expect(fileInput.getAttribute('capture')).toBeNull();
    expect(captureInput.getAttribute('capture')).toBe('environment');

    Object.defineProperty(fileInput, 'value', {
      configurable: true,
      writable: true,
      value: 'C:\\fakepath\\same.jpg',
    });
    const fileClick = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    const captureClick = vi.spyOn(captureInput, 'click').mockImplementation(() => undefined);

    await user.click(screen.getByRole('button', { name: enDocuments.ocr.extractImage }));
    expect(fileInput.value).toBe('');
    expect(fileClick).toHaveBeenCalledTimes(1);
    expect(captureClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: enDocuments.ocr.extractCapture }));
    expect(captureClick).toHaveBeenCalledTimes(1);
    fileClick.mockRestore();
    captureClick.mockRestore();
  });

  it('shows offline messaging and does not pretend OCR ran', () => {
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[]}
        vendors={[]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
        offline
      />,
    );
    expect(screen.getByText(enDocuments.ocr.offlineBlocked)).toBeVisible();
  });

  it('shows wrong-customer warning when org tax id differs from customer tax id', () => {
    const job: ExtractionJob = {
      ...baseJob(),
      rawMetadata: {
        ...baseJob().rawMetadata!,
        customer: { taxId: '514628903', name: 'Other Biz' },
      },
    };
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[job]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        organizationTaxId="511022493"
        defaultTarget="vendor_bill"
        workflow="vendor_bill"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );
    expect(screen.getByText(enDocuments.ocr.warnPossibleWrongCustomer)).toBeVisible();
  });

  it('does not show wrong-customer warning when customer tax id matches organization', () => {
    const job: ExtractionJob = {
      ...baseJob(),
      rawMetadata: {
        ...baseJob().rawMetadata!,
        customer: { taxId: '511022493', name: 'Our Biz' },
      },
    };
    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[job]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-1"
        organizationTaxId="511022493"
        defaultTarget="vendor_bill"
        workflow="vendor_bill"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );
    expect(screen.queryByText(enDocuments.ocr.warnPossibleWrongCustomer)).toBeNull();
  });

  it('shows queued, processing, and failed states with retry and batch progress', async () => {
    const user = userEvent.setup();
    const queued = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000q1',
      status: 'queued' as const,
      candidates: null,
      extractedCandidates: null,
      batchId: '01900000-0000-7000-8000-0000000000b1',
    };
    const processing = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000p1',
      status: 'processing' as const,
      candidates: null,
      extractedCandidates: null,
      batchId: '01900000-0000-7000-8000-0000000000b1',
      sourceDocument: {
        documentId: DOCUMENT_ID,
        filename: 'processing.png',
        mimeType: 'image/png',
      },
    };
    const failed = {
      ...baseJob(),
      id: '01900000-0000-7000-8000-0000000000f1',
      status: 'failed' as const,
      candidates: null,
      extractedCandidates: null,
      errorCode: 'timeout',
      errorMessage: 'Timed out',
      lastError: 'Timed out',
      sourceDocument: {
        documentId: DOCUMENT_ID,
        filename: 'failed.png',
        mimeType: 'image/png',
      },
    };

    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[queued, processing, failed]}
        initialBatches={[
          {
            id: '01900000-0000-7000-8000-0000000000b1',
            organizationId: 'org-1',
            createdByUserId: 'user-1',
            status: 'processing',
            totalCount: 3,
            completedCount: 0,
            failedCount: 1,
            createdAt: '2026-08-12T00:00:00.000Z',
            updatedAt: '2026-08-12T00:00:00.000Z',
          },
        ]}
        vendors={[]}
        organizationId="org-1"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    expect(document.querySelector('[data-pf-ocr-inbox-tab="waiting"]')).not.toBeNull();
    expect(document.querySelector('[data-pf-ocr-inbox-tab="processing"]')).not.toBeNull();
    expect(document.querySelector('[data-pf-ocr-inbox-tab="failed"]')).not.toBeNull();
    expect(document.querySelector('[data-pf-ocr-job-status="queued"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: enDocuments.ocr.cancelJob })).toBeVisible();
    expect(document.querySelector('[data-pf-ocr-batches]')).toBeTruthy();
    expect(document.querySelector('[data-pf-ocr-batch-id="01900000-0000-7000-8000-0000000000b1"]')).toBeTruthy();
    expect(screen.getByText(/of 3 read/i)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: new RegExp(enDocuments.ocr.inbox.processing) }));
    expect(screen.getAllByText(enDocuments.ocr.status.processing).length).toBeGreaterThan(0);
    expect(screen.getByText(enDocuments.ocr.stillProcessing)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: new RegExp(enDocuments.ocr.inbox.failed) }));
    const failedButton = document.querySelector(
      '[data-pf-ocr-job-status="failed"]',
    ) as HTMLButtonElement;
    await user.click(failedButton);
    expect(screen.getByRole('button', { name: enDocuments.ocr.retry })).toBeVisible();
  });

  it('requires an explicit not-a-duplicate override before confirm when hits exist', async () => {
    const user = userEvent.setup();
    const { confirmOcrCandidateAction } = await import('@/modules/ocr/application/ocr-actions');
    vi.mocked(confirmOcrCandidateAction).mockClear();
    const job: ExtractionJob = {
      ...baseJob(),
      rawMetadata: {
        ...baseJob().rawMetadata!,
        duplicateHits: [
          {
            kind: 'probable_document',
            reasonKeys: ['vendorName', 'reference'],
            expenseId: '01900000-0000-7000-8000-0000000000e1',
          },
        ],
      },
    };

    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[job]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-dup"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    expect(screen.getByRole('link', { name: enDocuments.ocr.duplicateOpenExpense })).toBeVisible();
    await acceptVendorField(user);
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(confirmOcrCandidateAction).not.toHaveBeenCalled();
    expect(screen.getByText(enDocuments.ocr.duplicateOverrideRequired)).toBeVisible();

    await overrideDuplicateIfShown(user);
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(confirmOcrCandidateAction).toHaveBeenCalled();
  });

  it('passes remembered project suggestion ids on confirm and never implies an actual', async () => {
    const user = userEvent.setup();
    const actions = await import('@/modules/ocr/application/ocr-actions');
    const projectId = '01900000-0000-7000-8000-0000000000p1';
    vi.mocked(actions.getOcrReviewSuggestionsAction).mockResolvedValue({
      ok: true,
      data: {
        projects: [{ projectId, projectName: 'Tower A', reason: 'memory' }],
        purchaseOrders: [],
        subcontractAgreements: [],
      },
    });
    vi.mocked(actions.confirmOcrCandidateAction).mockClear();

    const job: ExtractionJob = {
      ...baseJob(),
      rawMetadata: { ...baseJob().rawMetadata!, duplicateHits: [] },
    };

    renderPanel(
      <OcrReviewPanel
        initialStatus={liveStatus}
        initialJobs={[job]}
        vendors={[{ id: VENDOR_ID, name: 'Fixture Supplies Ltd' }]}
        organizationId="org-suggest"
        defaultTarget="expense"
        workflow="expense"
        canManageDocuments
        canCreateExpenses
        canManageAp
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tower A/ })).toBeVisible();
    });
    await user.click(screen.getByRole('button', { name: /Tower A/ }));
    await acceptVendorField(user);
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(actions.confirmOcrCandidateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: true,
        rememberProjectId: projectId,
        draftTarget: 'expense',
      }),
    );
  });
});
