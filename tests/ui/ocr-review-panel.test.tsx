import { screen } from '@testing-library/react';
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
}));

vi.mock('@/modules/documents/application/document-actions', () => ({
  prepareDocumentUploadAction: vi.fn(),
  finalizeDocumentUploadAction: vi.fn(),
  softDeleteDocumentAction: vi.fn(async () => ({})),
  downloadDocumentAction: vi.fn(async () => ({
    url: 'https://signed.example/receipt.png',
    filename: 'receipt.png',
  })),
}));

vi.mock('@/modules/documents/client/upload-document-bytes', () => ({
  uploadDocumentBytes: vi.fn(async () => ({ ok: true })),
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
    expect(screen.getAllByText(enDocuments.ocr.confidenceState.high).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(enDocuments.ocr.extractCapture)).toBeInTheDocument();
    expect(screen.getByLabelText(enDocuments.ocr.extractImage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enDocuments.ocr.viewOriginal })).toBeVisible();
    expect(screen.queryByText(VENDOR_ID)).toBeNull();
    expect(screen.getByDisplayValue('Fixture Supplies Ltd')).toBeInTheDocument();
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

    const capture = screen.getByLabelText(enDocuments.ocr.extractCapture);
    expect(capture).toHaveAttribute('capture', 'environment');
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

    const acceptBoxes = screen.getAllByRole('checkbox');
    await user.click(acceptBoxes[0]!);
    await user.click(screen.getByRole('button', { name: enDocuments.ocr.confirmExpense }));
    expect(confirmOcrCandidateAction).toHaveBeenCalled();
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
});
