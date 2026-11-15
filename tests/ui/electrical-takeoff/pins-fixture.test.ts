import { describe, expect, it } from 'vitest';
import {
  PINS_PREVIEW_HEIGHT,
  PINS_PREVIEW_URL,
  PINS_PREVIEW_WIDTH,
  pinsPlanMarks,
} from '@/modules/electrical-takeoff/ui/fixtures/build-pins-view';
import { getPinsFixture } from '@/modules/electrical-takeoff/ui/fixtures/pins-fixture';

describe('pins proof fixture', () => {
  it('places the latest Pins field marks on the 2400×1698 preview without moving them', () => {
    const marks = pinsPlanMarks();
    const { view, workerBase } = getPinsFixture();
    expect(marks.length).toBeGreaterThan(0);
    expect(workerBase).toHaveLength(marks.length);
    expect(view.detections).toHaveLength(marks.length);
    expect(view.sheets).toEqual([
      expect.objectContaining({
        sheetKey: 'p1',
        widthPx: PINS_PREVIEW_WIDTH,
        heightPx: PINS_PREVIEW_HEIGHT,
        previewUrl: PINS_PREVIEW_URL,
      }),
    ]);
    expect(PINS_PREVIEW_WIDTH).toBe(2400);
    expect(PINS_PREVIEW_HEIGHT).toBe(1698);

    const byId = new Map(view.detections.map((d) => [d.id, d]));
    for (const mark of marks) {
      const row = byId.get(mark.id);
      expect(row?.x).toBe(mark.x);
      expect(row?.y).toBe(mark.y);
      expect(row?.w).toBe(mark.w);
      expect(row?.h).toBe(mark.h);
      expect(row?.sheetKey).toBe('p1');
    }

    expect(byId.get('p1#441')).toMatchObject({ x: 896.7, y: 976.7, typeKey: 'light.point', rawClass: 'L6' });
    expect(byId.get('p1#438')).toMatchObject({ x: 994, y: 1021.7, typeKey: null, rawClass: 'L13' });
    expect(byId.get('p1#758')?.tagText).toBe('X2');
  });
});
