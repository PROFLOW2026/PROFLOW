import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import heExternalStorage from '@/locales/he-IL/externalStorage.json';
import { PdfJsViewer } from '@/modules/external-storage/ui/pdf-js-viewer';

const lazyPageProps = vi.fn();

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  Document: ({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess?: (payload: { numPages: number }) => void;
  }) => {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 2 });
    }, [onLoadSuccess]);
    return <div data-testid="pdf-document">{children}</div>;
  },
}));

vi.mock('@/modules/external-storage/ui/pdf-lazy-page', () => ({
  PdfLazyPage: (props: Record<string, unknown>) => {
    lazyPageProps(props);
    return <div data-testid={`pdf-page-${String(props.pageNumber)}`} />;
  },
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  lazyPageProps.mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

function renderViewer() {
  return render(
    <NextIntlClientProvider
      locale="he-IL"
      messages={{ externalStorage: heExternalStorage }}
      timeZone="Asia/Jerusalem"
    >
      <div className="fixed z-[70] flex h-dvh flex-col">
        <PdfJsViewer url="/api/org-storage/browser-download?scope=org&fileId=test" reloadKey={0} onRetry={() => {}} />
      </div>
    </NextIntlClientProvider>,
  );
}

describe('PdfJsViewer mobile toolbar', () => {
  it('opens the more menu above the preview shell and rotates without resetting page', async () => {
    const user = userEvent.setup();
    renderViewer();

    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeInTheDocument());

    const moreButton = screen.getByRole('button', { name: 'עוד' });
    await user.click(moreButton);

    const rotateItem = await screen.findByRole('menuitem', { name: /סובב 90°/ });
    const menuSurface = rotateItem.closest('[role="menu"]');
    expect(menuSurface).toBeTruthy();
    expect(menuSurface?.className).toMatch(/z-\[80\]/);

    await user.click(rotateItem);

    await waitFor(() => {
      expect(lazyPageProps.mock.calls.some((call) => call[0]?.rotation === 90)).toBe(true);
    });
  });
});
