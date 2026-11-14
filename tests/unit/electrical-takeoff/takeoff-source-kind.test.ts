import { describe, expect, it } from 'vitest';

import { inferTakeoffSourceKind } from '@/modules/electrical-takeoff/application/takeoff-source-kind';

describe('inferTakeoffSourceKind', () => {
  it('detects pdf, dwg, dxf by extension', () => {
    expect(inferTakeoffSourceKind('plan.pdf', 'application/pdf')).toBe('pdf');
    expect(inferTakeoffSourceKind('A1.dwg', 'application/octet-stream')).toBe('dwg');
    expect(inferTakeoffSourceKind('x.dxf', 'text/plain')).toBe('dxf');
    expect(inferTakeoffSourceKind('readme.txt', 'text/plain')).toBeNull();
  });
});