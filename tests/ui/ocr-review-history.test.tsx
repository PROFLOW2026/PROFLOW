import { screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import enCommon from '@/locales/en/common.json';
import enDocuments from '@/locales/en/documents.json';
import { buildFixtureCandidates } from '@/modules/ocr';
import { OcrReviewHistory } from '@/modules/ocr/ui/ocr-review-history';
import type { ExtractionJob } from '@/modules/ocr/domain/types';

vi.mock('@/modules/documents/application/document-actions', () => ({
  downloadDocumentAction: vi.fn(async ({ documentId }: { documentId: string }) => ({
    url: `https://signed.example/${documentId}.jpg`,
    filename: `${documentId}.jpg`,
  })),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function historyJob(overrides: Partial<ExtractionJob> = {}): ExtractionJob {
  const now = '2026-08-12T12:00:00.000Z';
  return {
    id: '01900000-0000-7000-8000-0000000000h1',
    organizationId: 'org-1',
    documentId: 'doc-h1',
    sourceDocument: {
      documentId: 'doc-h1',
      filename: 'accepted-receipt.jpg',
      mimeType: 'image/jpeg',
    },
    status: 'succeeded',
    reviewStatus: 'accepted',
    candidates: buildFixtureCandidates(),
    extractedCandidates: buildFixtureCandidates(),
    reviewOverrides: null,
    acceptedFields: null,
    rejectedFields: null,
    rawMetadata: {
      providerId: 'scripted',
      documentTypeKey: 'tax_invoice',
    },
    overallConfidence: 0.9,
    errorCode: null,
    errorMessage: null,
    providerId: 'scripted',
    confirmedExpenseId: 'exp-h1',
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
    confirmedDraftTarget: 'expense',
    documentVersionId: null,
    batchId: null,
    attemptCount: 0,
    lastError: null,
    idempotencyKey: null,
    queuedAt: now,
    startedAt: null,
    completedAt: now,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderHistory(ui: ReactElement) {
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

describe('OCR review history', () => {
  it('shows accepted target link and rejected rows without inventing drafts', () => {
    const accepted = historyJob();
    const rejected = historyJob({
      id: '01900000-0000-7000-8000-0000000000h2',
      status: 'rejected',
      reviewStatus: 'rejected',
      confirmedExpenseId: null,
      confirmedDraftTarget: null,
      sourceDocument: {
        documentId: 'doc-h2',
        filename: 'rejected-invoice.jpg',
        mimeType: 'image/jpeg',
      },
    });

    renderHistory(<OcrReviewHistory jobs={[accepted, rejected]} />);

    expect(screen.getByText(enDocuments.ocr.historyStatusAccepted)).toBeVisible();
    expect(screen.getByText(enDocuments.ocr.historyStatusRejected)).toBeVisible();
    expect(screen.getByRole('link', { name: enDocuments.ocr.historyOpenTarget })).toHaveAttribute(
      'href',
      '/expenses/exp-h1',
    );
    expect(
      document.querySelector(
        '[data-pf-ocr-history-job-id="01900000-0000-7000-8000-0000000000h2"][data-pf-ocr-history-status="rejected"]',
      ),
    ).toBeTruthy();
  });
});
