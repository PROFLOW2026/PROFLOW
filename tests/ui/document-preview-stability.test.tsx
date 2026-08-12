import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enCommon from '@/locales/en/common.json';
import enDocuments from '@/locales/en/documents.json';
import { DocumentInlinePreview } from '@/modules/documents/ui/document-inline-preview';
import { DocumentPreviewDialog } from '@/modules/documents/ui/document-preview-dialog';

const downloadDocumentAction = vi.fn();

vi.mock('@/modules/documents/application/document-actions', () => ({
  downloadDocumentAction: (...args: unknown[]) => downloadDocumentAction(...args),
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

describe('document preview signed-URL stability', () => {
  beforeEach(() => {
    downloadDocumentAction.mockReset();
    downloadDocumentAction.mockImplementation(async ({ documentId }: { documentId: string }) => ({
      url: `https://signed.example/${documentId}.jpg`,
      filename: `${documentId}-20240101_120000.jpg`,
    }));
  });

  it('requests one signed URL for the same document across 10+ parent re-renders', async () => {
    const { rerender } = render(
      <Wrapper>
        <DocumentInlinePreview
          documentId="doc-a"
          filename="20240101_120000.jpg"
          mimeType="image/jpeg"
        />
      </Wrapper>,
    );

    await waitFor(() => expect(downloadDocumentAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-a.jpg');

    for (let i = 0; i < 12; i += 1) {
      rerender(
        <Wrapper>
          <DocumentInlinePreview
            documentId="doc-a"
            filename="20240101_120000.jpg"
            mimeType="image/jpeg"
          />
        </Wrapper>,
      );
    }

    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadDocumentAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('loads exactly once more when documentId changes', async () => {
    const { rerender } = render(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-a" filename="a.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );
    await waitFor(() => expect(downloadDocumentAction).toHaveBeenCalledTimes(1));

    rerender(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-b" filename="b.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );
    await waitFor(() => expect(downloadDocumentAction).toHaveBeenCalledTimes(2));
    expect(downloadDocumentAction).toHaveBeenLastCalledWith({ documentId: 'doc-b' });
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-b.jpg'),
    );
    expect(screen.queryByRole('img')?.getAttribute('src')).not.toContain('doc-a.jpg');
  });

  it('ignores a slow previous download after rapid A→B→C switches', async () => {
    let resolveA: ((value: { url: string; filename: string }) => void) | undefined;
    downloadDocumentAction.mockImplementation(async ({ documentId }: { documentId: string }) => {
      if (documentId === 'doc-a') {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return {
        url: `https://signed.example/${documentId}.jpg`,
        filename: `${documentId}.jpg`,
      };
    });

    const { rerender } = render(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-a" filename="a.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );
    await waitFor(() => expect(downloadDocumentAction).toHaveBeenCalledTimes(1));

    rerender(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-b" filename="b.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );
    rerender(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-c" filename="c.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-c.jpg'),
    );
    resolveA?.({ url: 'https://signed.example/doc-a.jpg', filename: 'a.jpg' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/doc-c.jpg');
    expect(document.querySelector('[data-pf-preview-document-id="doc-c"]')).toBeTruthy();
  });

  it('keeps the image mounted under a mobile-sized viewport after re-renders', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });

    const { rerender } = render(
      <Wrapper>
        <DocumentInlinePreview documentId="doc-m" filename="cam.jpg" mimeType="image/jpeg" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument(), {
      timeout: 5_000,
    });
    const firstImg = screen.getByRole('img');

    for (let i = 0; i < 8; i += 1) {
      rerender(
        <Wrapper>
          <DocumentInlinePreview documentId="doc-m" filename="cam.jpg" mimeType="image/jpeg" />
        </Wrapper>,
      );
    }

    expect(screen.getByRole('img')).toBe(firstImg);
    expect(downloadDocumentAction).toHaveBeenCalledTimes(1);
  });

  it('isolates LTR filenames so timestamp .jpg is not visually reversed in RTL', async () => {
    render(
      <Wrapper>
        <DocumentInlinePreview
          documentId="doc-rtl"
          filename="20240101_120000.jpg"
          mimeType="image/jpeg"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(downloadDocumentAction).toHaveBeenCalled());
    const name = screen.getByText('20240101_120000.jpg');
    expect(name).toHaveAttribute('dir', 'ltr');
  });

  it('does not spam download when opening/closing the preview dialog for one document', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open-preview
          </button>
          <DocumentPreviewDialog
            open={open}
            onOpenChange={setOpen}
            documentId="doc-dialog"
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
    expect(downloadDocumentAction).toHaveBeenCalledTimes(0);

    async function openAndClose() {
      await user.click(screen.getByRole('button', { name: 'open-preview' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByText('Close'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }

    await openAndClose();
    expect(downloadDocumentAction).toHaveBeenCalledTimes(1);
    await openAndClose();
    await openAndClose();
    expect(downloadDocumentAction).toHaveBeenCalledTimes(1);
  });
});
