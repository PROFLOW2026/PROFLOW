import { describe, expect, it } from 'vitest';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';

describe('real7155 worker fixture', () => {
  it('builds a populated analysis view from corpus JSON', () => {
    const { view, workerBase } = getReal7155Fixture();
    expect(workerBase.length).toBeGreaterThan(400);
    expect(view.detections.length).toBe(workerBase.length);
    expect(view.sheets.some((s) => s.fileId === 'lightg')).toBe(true);
    expect(view.workerWarnings.length).toBeGreaterThan(0);
    // Full ingest with default sheet inclusion (all non-legend layouts), not corpus sheetSelection slice (~250).
    expect(view.boq.counting?.countedTotal).toBeGreaterThan(400);
    expect(view.boq.lines.length).toBeGreaterThan(0);
  });
});