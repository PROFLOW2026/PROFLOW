import { describe, expect, it } from 'vitest';
import {
  PDF_LAZY_ROOT_MARGIN,
  PDF_ZOOM_PRESETS,
  clampPdfZoom,
  computePdfPageWidth,
  computePdfZoomPercent,
  estimatePageHeight,
  zoomPresetToPercent,
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

  it('exposes standard zoom presets including 100% and 400%', () => {
    expect(PDF_ZOOM_PRESETS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
    expect(zoomPresetToPercent(1)).toBe(100);
    expect(zoomPresetToPercent(4)).toBe(400);
  });

  it('computes rounded zoom percent from rendered page width', () => {
    expect(computePdfZoomPercent({ containerWidth: 800, pageWidth: 1200 })).toBe(150);
    expect(computePdfZoomPercent({ containerWidth: 0, pageWidth: 500 })).toBe(100);
  });
});
