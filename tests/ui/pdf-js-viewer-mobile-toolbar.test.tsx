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

    Object.defineProperty(scrollRoot, 'scrollWidth', { configurable: true, value: 1200 });
    Object.defineProperty(scrollRoot, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(scrollRoot, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scrollRoot, 'clientHeight', { configurable: true, value: 700 });

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

  it('two-finger pinch applies CSS scale around an origin (not live pageWidth remount)', async () => {
    const { container } = renderViewer();
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeInTheDocument());

    const scrollRoot = container.querySelector('.overflow-auto') as HTMLDivElement | null;
    expect(scrollRoot).toBeTruthy();
    if (!scrollRoot) return;

    const pageWidthBefore = lazyPageProps.mock.calls.at(-1)?.[0]?.pageWidth;

    fireEvent.touchStart(scrollRoot, {
      touches: [
        { identifier: 1, clientX: 120, clientY: 200 },
        { identifier: 2, clientX: 220, clientY: 200 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 120, clientY: 200 },
        { identifier: 2, clientX: 220, clientY: 200 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 120, clientY: 200 },
        { identifier: 2, clientX: 220, clientY: 200 },
      ],
    });
    fireEvent.touchMove(scrollRoot, {
      touches: [
        { identifier: 1, clientX: 80, clientY: 200 },
        { identifier: 2, clientX: 280, clientY: 200 },
      ],
      targetTouches: [
        { identifier: 1, clientX: 80, clientY: 200 },
        { identifier: 2, clientX: 280, clientY: 200 },
      ],
      changedTouches: [
        { identifier: 1, clientX: 80, clientY: 200 },
        { identifier: 2, clientX: 280, clientY: 200 },
      ],
    });

    const scaled = container.querySelector('[style*="scale("]') as HTMLElement | null;
    expect(scaled).toBeTruthy();
    expect(scaled?.style.transform).toMatch(/scale\(/);
    expect(scaled?.style.transformOrigin.length).toBeGreaterThan(0);
    // Live pinch must not remount pages via pageWidth — that froze Android.
    expect(lazyPageProps.mock.calls.at(-1)?.[0]?.pageWidth).toBe(pageWidthBefore);
  });

  it('one-finger TouchEvent pan updates scroll (Android path, BUG-03)', async () => {
    const { container } = renderViewer();
    await waitFor(() => expect(screen.getByTestId('pdf-document')).toBeInTheDocument());

    const scrollRoot = container.querySelector('.overflow-auto') as HTMLDivElement | null;
    expect(scrollRoot).toBeTruthy();
    if (!scrollRoot) return;

    expect(scrollRoot.getAttribute('dir')).toBe('ltr');

    Object.defineProperty(scrollRoot, 'scrollWidth', { configurable: true, value: 1200 });
    Object.defineProperty(scrollRoot, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(scrollRoot, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scrollRoot, 'clientHeight', { configurable: true, value: 700 });

    scrollRoot.scrollLeft = 400;
    scrollRoot.scrollTop = 100;

    fireEvent.touchStart(scrollRoot, {
      touches: [{ identifier: 7, clientX: 200, clientY: 200 }],
      targetTouches: [{ identifier: 7, clientX: 200, clientY: 200 }],
      changedTouches: [{ identifier: 7, clientX: 200, clientY: 200 }],
    });
    // Finger moves left → content scrolls right (toward opposite edge).
    fireEvent.touchMove(scrollRoot, {
      touches: [{ identifier: 7, clientX: 100, clientY: 170 }],
      targetTouches: [{ identifier: 7, clientX: 100, clientY: 170 }],
      changedTouches: [{ identifier: 7, clientX: 100, clientY: 170 }],
    });

    expect(scrollRoot.scrollLeft).toBe(500);
    expect(scrollRoot.scrollTop).toBe(130);

    fireEvent.touchStart(scrollRoot, {
      touches: [{ identifier: 8, clientX: 200, clientY: 200 }],
      targetTouches: [{ identifier: 8, clientX: 200, clientY: 200 }],
      changedTouches: [{ identifier: 8, clientX: 200, clientY: 200 }],
    });
    // Opposite horizontal direction still moves (not stuck at an edge).
    fireEvent.touchMove(scrollRoot, {
      touches: [{ identifier: 8, clientX: 350, clientY: 200 }],
      targetTouches: [{ identifier: 8, clientX: 350, clientY: 200 }],
      changedTouches: [{ identifier: 8, clientX: 350, clientY: 200 }],
    });

    expect(scrollRoot.scrollLeft).toBe(350);
  });
});
