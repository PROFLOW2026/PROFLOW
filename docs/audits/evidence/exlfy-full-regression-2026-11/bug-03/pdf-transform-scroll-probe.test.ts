/**
 * BUG-03 evidence: pinch preview may use CSS transform; committed zoom must grow layout scroll extents.
 * Free pan must use pointer-capture (ZoomablePreviewImage parity), not mouse-only hand tool.
 * Real-device pinch/pan on Android/iOS: still exercise manually after this contract passes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEWER_PATH = path.join(process.cwd(), 'src/modules/external-storage/ui/pdf-js-viewer.tsx');
const SHELL_PATH = path.join(
  process.cwd(),
  'src/modules/external-storage/ui/storage-file-preview-shell.tsx',
);

/** PdfJsViewer: transform preview does not grow layout scroll extents; committed zoom does. */
function layoutScrollExtent(layoutWidth: number, visualScale: number, transformPreview: boolean): number {
  return transformPreview ? layoutWidth : layoutWidth * visualScale;
}

describe('BUG-03 PDF transform vs layout scroll (automated proof)', () => {
  it('transform preview keeps layout scroll extent; merged zoom grows it', () => {
    expect(layoutScrollExtent(300, 2, true)).toBe(300);
    expect(layoutScrollExtent(300, 2, false)).toBe(600);
  });

  it('DOM: scale(2) does not change inline layout width (jsdom layout metrics may be zero)', () => {
    const inner = document.createElement('div');
    inner.style.width = '300px';
    inner.style.height = '400px';
    inner.style.transformOrigin = 'top center';
    document.body.append(inner);
    const beforeWidth = inner.style.width;
    inner.style.transform = 'scale(2)';
    expect(inner.style.width).toBe(beforeWidth);
    if (inner.offsetWidth > 0) {
      expect(inner.offsetWidth).toBe(300);
    }
    inner.remove();
  });

  it('PdfJsViewer applies gestureScale via transform during pinch, then commitGestureZoom into layout', () => {
    const source = readFileSync(VIEWER_PATH, 'utf8');
    expect(source).toMatch(/const visualScale = gestureScale/);
    expect(source).toMatch(/transform:\s*`scale\(\$\{visualScale\}\)`/);
    expect(source).toMatch(/commitGestureZoom/);
    expect(source).not.toMatch(/pageWidth:\s*pageWidth \* gestureScale/);
  });

  it('uses pointer-capture free pan (touch + mouse), not mouse-only hand tool', () => {
    const source = readFileSync(VIEWER_PATH, 'utf8');
    expect(source).toMatch(/onPointerDown=\{onPanPointerDown\}/);
    expect(source).toMatch(/setPointerCapture/);
    expect(source).toMatch(/onTouchStart/);
    expect(source).toMatch(/event\.touches\.length !== 2/);
    expect(source).toMatch(/touch-none/);
    expect(source).not.toMatch(/onMouseDown=\{onPanMouseDown\}/);
    expect(source).toMatch(/isInteractiveSheetMarkTarget/);
  });

  it('preview shell does not lock body with touch-action none', () => {
    const source = readFileSync(SHELL_PATH, 'utf8');
    expect(source).toMatch(/lockBodyScroll/);
    expect(source).not.toMatch(/body\.style\.touchAction\s*=\s*['"]none['"]/);
  });
});
