import { describe, expect, it } from 'vitest';
import {
  PDF_LAZY_ROOT_MARGIN,
  clampPdfZoom,
  computePdfPageWidth,
  estimatePageHeight,
} from '@/modules/external-storage/ui/pdf-viewer-utils';

describe('pdf viewer utils', () => {
  it('clamps zoom between min and max', () => {
    expect(clampPdfZoom(0.1)).toBe(0.25);
    expect(clampPdfZoom(12)).toBe(10);
    expect(clampPdfZoom(2)).toBe(2);
  });

  it('computes fit-width page width from container and zoom', () => {
    expect(
      computePdfPageWidth({
        fitMode: 'width',
        containerWidth: 800,
        containerHeight: 600,
        pageAspect: 1.4,
        zoomFactor: 2,
      }),
    ).toBe(1600);
  });

  it('computes fit-page width using aspect ratio', () => {
    const width = computePdfPageWidth({
      fitMode: 'page',
      containerWidth: 1000,
      containerHeight: 500,
      pageAspect: 1.414,
      zoomFactor: 1,
    });
    expect(width).toBe(707);
  });

  it('estimates placeholder height for lazy pages', () => {
    expect(estimatePageHeight(800, 1.6)).toBe(500);
  });

  it('uses generous lazy root margin for prefetch', () => {
    expect(PDF_LAZY_ROOT_MARGIN).toContain('320px');
  });
});
