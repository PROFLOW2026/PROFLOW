import { describe, expect, it } from 'vitest';
import { lineWidthPxFromHundredths } from '@/modules/external-storage/ui/cad/pf-cad/renderer/segment-batch';

describe('CAD zoom lineweight (no geometry rebatch on zoom)', () => {
  it('derives screen line width from zoom at draw time', () => {
    const lw = 25;
    const low = lineWidthPxFromHundredths(lw, 0.5);
    const high = lineWidthPxFromHundredths(lw, 4);
    expect(high).toBeGreaterThan(low);
  });
});
