import { describe, expect, it } from 'vitest';
import { detectionsForSheet, sheetRefId } from '@/modules/electrical-takeoff/ui/sheet-ref';

describe('sheet-ref', () => {
  it('isolates lightg p1 from legend p1', () => {
    const detections = [
      { id: 'p1#1', sheetKey: 'p1' },
      { id: 'layout:x#1', sheetKey: 'layout:x' },
    ];
    const lightg = { fileId: 'lightg', sheetKey: 'p1', name: 'lg', kind: 'pdf_page' as const, index: 0, widthPx: 1, heightPx: 1, previewUrl: null, floorLabel: null, scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' as const, note: null }, analyzed: 'full' as const, xrefsMissing: [], hiddenByLayers: 0 };
    const legend = { ...lightg, fileId: 'legend' };
    expect(detectionsForSheet(detections, lightg)).toHaveLength(1);
    expect(detectionsForSheet(detections, legend)).toHaveLength(0);
    expect(sheetRefId(lightg)).toBe('lightg:p1');
  });
});