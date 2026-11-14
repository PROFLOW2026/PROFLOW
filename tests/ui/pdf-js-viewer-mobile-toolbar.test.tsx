import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('mouse hand-tool pointer pan updates scrollLeft/scrollTop (BUG-03)', async () => {
    const user = userEvent.setup();
    const { container } = renderViewer();
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeInTheDocument());

    const handButton = screen.getByRole('button', { name: /יד|Hand|hand/i });
    await user.click(handButton);

    const scrollRoot = container.querySelector('.overflow-auto') as HTMLDivElement | null;
    expect(scrollRoot).toBeTruthy();
    if (!scrollRoot) return;

    scrollRoot.scrollLeft = 0;
    scrollRoot.scrollTop = 0;
    scrollRoot.setPointerCapture = vi.fn();
    scrollRoot.releasePointerCapture = vi.fn();
    scrollRoot.hasPointerCapture = vi.fn(() => true);

    fireEvent.pointerDown(scrollRoot, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    });
    fireEvent.pointerMove(scrollRoot, {
      clientX: 140,
      clientY: 160,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    });

    expect(scrollRoot.scrollLeft).toBe(60);
    expect(scrollRoot.scrollTop).toBe(40);
    expect(scrollRoot.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('one-finger TouchEvent pan updates scroll (Android path, BUG-03)', async () => {
    const { container } = renderViewer();
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeInTheDocument());

    const scrollRoot = container.querySelector('.overflow-auto') as HTMLDivElement | null;
    expect(scrollRoot).toBeTruthy();
    if (!scrollRoot) return;

    scrollRoot.scrollLeft = 0;
    scrollRoot.scrollTop = 0;

    fireEvent.touchStart(scrollRoot, {
      touches: [{ identifier: 7, clientX: 200, clientY: 200 }],
      targetTouches: [{ identifier: 7, clientX: 200, clientY: 200 }],
      changedTouches: [{ identifier: 7, clientX: 200, clientY: 200 }],
    });
    fireEvent.touchMove(scrollRoot, {
      touches: [{ identifier: 7, clientX: 150, clientY: 170 }],
      targetTouches: [{ identifier: 7, clientX: 150, clientY: 170 }],
      changedTouches: [{ identifier: 7, clientX: 150, clientY: 170 }],
    });

    expect(scrollRoot.scrollLeft).toBe(50);
    expect(scrollRoot.scrollTop).toBe(30);
  });
});
