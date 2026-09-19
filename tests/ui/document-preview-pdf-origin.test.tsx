import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enCommon from '@/locales/en/common.json';
import enDocuments from '@/locales/en/documents.json';
import { DocumentPreviewDialog } from '@/modules/documents/ui/document-preview-dialog';

const downloadDocumentAction = vi.fn();

vi.mock('@/modules/documents/application/document-actions', () => ({
  downloadDocumentAction: (...args: unknown[]) => downloadDocumentAction(...args),
}));

vi.mock('@/modules/external-storage/ui/pdf-js-viewer', () => ({
  PdfJsViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer">{url}</div>,
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="he-IL"
      messages={{ documents: enDocuments, common: enCommon }}
      timeZone="Asia/Jerusalem"
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe('DocumentPreviewDialog PDF same-origin source', () => {
  beforeEach(() => {
    downloadDocumentAction.mockReset();
  });

  it('uses same-origin content route for PDF without fetching external signed URLs', async () => {
    const user = userEvent.setup();
    const documentId = '133ba781-95cc-494c-874d-57f5329af863';

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open-pdf
          </button>
          <DocumentPreviewDialog
            open={open}
            onOpenChange={setOpen}
            documentId={documentId}
            filename="invoice.pdf"
            mimeType="application/pdf"
          />
        </>
      );
    }

    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: 'open-pdf' }));

    const viewer = await screen.findByTestId('pdf-viewer');
    expect(viewer.textContent).toBe(
      `/api/org-storage/download/${documentId}?disposition=inline`,
    );
    expect(downloadDocumentAction).not.toHaveBeenCalled();
    expect(viewer.textContent).not.toContain('dropbox');
    expect(viewer.textContent).not.toContain('storage.test');
  });
});
