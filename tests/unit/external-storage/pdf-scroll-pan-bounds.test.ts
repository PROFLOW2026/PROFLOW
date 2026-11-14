import { describe, expect, it } from 'vitest';
import {
  applyPdfScrollPan,
  centeredPdfScrollLeft,
  clampPdfScrollLeft,
  pdfMaxScrollLeft,
  pdfPinchTransformOrigin,
  scrollAfterScaleAtFocal,
  touchPairMidpoint,
  viewportFocalFromClientMidpoint,
} from '@/modules/external-storage/ui/pdf-viewer-utils';

describe('pdf scroll pan bounds (LTR)', () => {
  it('exposes a symmetric horizontal range when content is wider than the viewport', () => {
    expect(pdfMaxScrollLeft(1200, 400)).toBe(800);
    expect(centeredPdfScrollLeft(1200, 400)).toBe(400);
    expect(clampPdfScrollLeft(-50, 1200, 400)).toBe(0);
    expect(clampPdfScrollLeft(9999, 1200, 400)).toBe(800);
  });

  it('pans left and right from a centered start without clamping one side early', () => {
    const el = {
      scrollLeft: 400,
      scrollTop: 0,
      scrollWidth: 1200,
      scrollHeight: 2000,
      clientWidth: 400,
      clientHeight: 700,
    };
    const origin = { scrollLeft: 400, scrollTop: 0 };

    applyPdfScrollPan(el, origin, { dx: 200, dy: 0 }); // finger right → content left
    expect(el.scrollLeft).toBe(200);

    applyPdfScrollPan(el, origin, { dx: -200, dy: 0 }); // finger left → content right
    expect(el.scrollLeft).toBe(600);

    applyPdfScrollPan(el, origin, { dx: 400, dy: 0 });
    expect(el.scrollLeft).toBe(0);

    applyPdfScrollPan(el, origin, { dx: -400, dy: 0 });
    expect(el.scrollLeft).toBe(800);
  });
});

describe('pdf pinch zoom focal anchor', () => {
  it('keeps the content point under a fixed focal after scale-up (not jump to top)', () => {
    const focalX = 200;
    const focalY = 300;
    const before = { scrollLeft: 100, scrollTop: 400 };
    const after = scrollAfterScaleAtFocal({
      ...before,
      focalX,
      focalY,
      scaleRatio: 2,
    });
    // Content under focal before: (300, 700). After ×2 with same focal → scroll (400, 1100).
    expect(after.scrollLeft).toBe(400);
    expect(after.scrollTop).toBe(1100);
    expect(after.scrollTop).not.toBe(0);
  });

  it('follows a moving pinch midpoint while scaling', () => {
    const after = scrollAfterScaleAtFocal({
      scrollLeft: 100,
      scrollTop: 200,
      prevFocalX: 150,
      prevFocalY: 180,
      focalX: 180,
      focalY: 220,
      scaleRatio: 1.5,
    });
    expect(after.scrollLeft).toBe((100 + 150) * 1.5 - 180);
    expect(after.scrollTop).toBe((200 + 180) * 1.5 - 220);
  });

  it('maps client midpoint into the LTR scrollport', () => {
    const mid = touchPairMidpoint(
      { clientX: 100, clientY: 200 },
      { clientX: 300, clientY: 400 },
    );
    expect(mid).toEqual({ x: 200, y: 300 });
    expect(viewportFocalFromClientMidpoint(mid, { left: 40, top: 60 })).toEqual({
      x: 160,
      y: 240,
    });
  });

  it('computes CSS pinch transform-origin under the finger midpoint (not top-center)', () => {
    expect(
      pdfPinchTransformOrigin({
        scrollLeft: 120,
        scrollTop: 80,
        focalX: 200,
        focalY: 150,
        contentOffsetLeft: 8,
        contentOffsetTop: 16,
      }),
    ).toEqual({ x: 312, y: 214 });
  });
});
