import { describe, expect, it } from 'vitest';
import {
  applyPdfScrollPan,
  centeredPdfScrollLeft,
  clampPdfScrollLeft,
  pdfMaxScrollLeft,
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
