import { describe, expect, it } from 'vitest';

import { devicesFromNote, tagWithDeviceCount, tagWithDevicePair } from '@/modules/electrical-takeoff/domain/quantity-notes';

describe('devicesFromNote', () => {
  it('reads one X2 and ignores ampere notes and X4', () => {
    expect(devicesFromNote('X2')).toBe(2);
    expect(devicesFromNote('x2')).toBe(2);
    expect(devicesFromNote('×2')).toBe(2);
    expect(devicesFromNote('(X2)')).toBe(2);
    expect(devicesFromNote('13 X2')).toBe(2);
    expect(devicesFromNote('X2 X2')).toBe(2);
    expect(devicesFromNote('X4')).toBe(1);
    expect(devicesFromNote('×3')).toBe(3);
    expect(devicesFromNote('13 ×4')).toBe(4);
    expect(devicesFromNote('2X16A')).toBe(1);
    expect(devicesFromNote('X24')).toBe(1);
    expect(devicesFromNote(null)).toBe(1);
  });

  it('adds and removes the note without dropping a circuit tag', () => {
    expect(tagWithDevicePair('13', true)).toBe('13 ×2');
    expect(tagWithDeviceCount('13 X2', 3)).toBe('13 ×3');
    expect(tagWithDevicePair('13 X2', false)).toBe('13');
    expect(tagWithDevicePair('X2', false)).toBeNull();
  });
});
