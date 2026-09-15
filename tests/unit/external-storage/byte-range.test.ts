import { describe, expect, it } from 'vitest';
import {
  buildContentDisposition,
  buildContentRange,
  parseByteRangeHeader,
} from '@/modules/external-storage/server/byte-range';

describe('parseByteRangeHeader', () => {
  it('returns null when no range header', () => {
    expect(parseByteRangeHeader(null, 1000)).toBeNull();
  });

  it('parses open-ended range from start byte', () => {
    expect(parseByteRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses closed range', () => {
    expect(parseByteRangeHeader('bytes=0-1023', 5000)).toEqual({ start: 0, end: 1023 });
  });

  it('parses suffix range', () => {
    expect(parseByteRangeHeader('bytes=-128', 1000)).toEqual({ start: 872, end: 999 });
  });

  it('returns unsatisfiable when range starts beyond file', () => {
    expect(parseByteRangeHeader('bytes=2000-', 1000)).toBe('unsatisfiable');
  });

  it('clamps end to file size', () => {
    expect(parseByteRangeHeader('bytes=900-1500', 1000)).toEqual({ start: 900, end: 999 });
  });
});

describe('buildContentRange', () => {
  it('formats content-range header', () => {
    expect(buildContentRange(0, 1023, 5000)).toBe('bytes 0-1023/5000');
  });
});

describe('buildContentDisposition', () => {
  it('uses inline for preview', () => {
    expect(buildContentDisposition('plan.pdf', 'inline')).toContain('inline');
    expect(buildContentDisposition('plan.pdf', 'inline')).toContain('plan.pdf');
  });

  it('uses attachment for device open', () => {
    expect(buildContentDisposition('plan.pdf', 'attachment')).toContain('attachment');
  });
});
