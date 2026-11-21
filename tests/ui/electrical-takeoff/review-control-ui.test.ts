import { describe, expect, it } from 'vitest';
import { occurrenceFocusRect, symbolContextRect, symbolThumbnailRect, unionRects } from '@/modules/electrical-takeoff/ui/viewer/viewer-math';
import { symbolCropSource } from '@/modules/electrical-takeoff/ui/review-guide';
import { boqLineIdentityStatus } from '@/modules/electrical-takeoff/domain/review-copy';
import { cadOccurrenceFocusExtent } from '@/modules/electrical-takeoff/domain/cad-sheet-frame';

describe('per-occurrence focus windows', () => {
  it('zooms each contact in a 120-mark group to that mark, not the union of the group', () => {
    const contacts = Array.from({ length: 120 }, (_, index) => ({
      x: 80 + (index % 20) * 180,
      y: 90 + Math.floor(index / 20) * 140,
      w: 14,
      h: 14,
    }));
    const first = occurrenceFocusRect(contacts[0]!);
    const last = occurrenceFocusRect(contacts[119]!);
    const group = unionRects(contacts.map((mark) => ({ x: mark.x, y: mark.y, width: mark.w, height: mark.h })));
    expect(first.width).toBeLessThanOrEqual(180);
    expect(last.width).toBeLessThanOrEqual(180);
    expect(first.x).toBe(contacts[0]!.x);
    expect(last.x).toBe(contacts[119]!.x);
    expect(group?.width).toBeGreaterThan(first.width * 8);
    expect(first.width).toBeLessThan((group?.width ?? 0) / 4);
  });

  it('keeps thumb, focus and context windows around one symbol', () => {
    const mark = { x: 400, y: 300, w: 16, h: 16 };
    const sheet = { widthPx: 8000, heightPx: 5000 };
    const image = { width: 8000, height: 5000 };
    const thumb = symbolCropSource(mark, sheet, image, 'thumb');
    const focus = symbolCropSource(mark, sheet, image, 'focus');
    const context = symbolCropSource(mark, sheet, image, 'context');
    expect(thumb.sw).toBeLessThan(focus.sw);
    expect(focus.sw).toBeLessThan(context.sw);
    expect(context.sw).toBeLessThan(sheet.widthPx * 0.05);
    expect(symbolThumbnailRect(mark).width).toBeLessThanOrEqual(96);
    expect(symbolContextRect(mark).width).toBeLessThanOrEqual(260);
  });

  it('keeps a CAD occurrence window around the accessory plus nearby context', () => {
    const box = { located: true as const, minX: 100, minY: 200, maxX: 118, maxY: 218 };
    const drawing: [number, number, number, number] = [0, 0, 1189, 841];
    const extent = cadOccurrenceFocusExtent({ x: 109, y: 209 }, box, drawing);
    const width = extent[2] - extent[0];
    expect(width).toBeGreaterThan(80);
    expect(width).toBeLessThan(841 * 0.3);
    expect(width).toBeGreaterThan(18 * 7);
  });
});

describe('3643-style quantity rows', () => {
  it('shows the 50-unit Electrolyte legend line as automatically identified', () => {
    expect(
      boqLineIdentityStatus({
        verified: false,
        identitySource: 'legend',
        typeKey: null,
        originalLabel: 'תוצרת אלקטרולייט שקע יחיד',
        breakdown: { unclassified: 0, low: 0, medium: 0, userConfirmed: 0 },
        suppressVerified: false,
      }),
    ).toBe('autoIdentified');
  });

  it('keeps a socket/switch compare row on a legend identity without forcing catalog review', () => {
    expect(
      boqLineIdentityStatus({
        verified: false,
        identitySource: 'legend',
        typeKey: null,
        originalLabel: 'מפסק מאור',
        breakdown: { unclassified: 0, low: 0, medium: 0, userConfirmed: 0 },
        suppressVerified: false,
      }),
    ).toBe('autoIdentified');
  });
});
