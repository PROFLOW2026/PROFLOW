import { describe, expect, it } from 'vitest';
import {
  cadShxVisualLine,
  shouldApplyCadBackwardsMirror,
} from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-text-bidi';

describe('CAD mixed Hebrew / number order', () => {
  it('does not geometrically mirror Hebrew so 1.5 cannot become 5.1', () => {
    expect(shouldApplyCadBackwardsMirror('חתך 1.5 ממ', true)).toBe(false);
    expect(shouldApplyCadBackwardsMirror('ROOM 101', true)).toBe(true);
    expect(shouldApplyCadBackwardsMirror('חתך 1.5 ממ', false)).toBe(false);
  });

  it('keeps decimals, multipliers and cable marks in original order', () => {
    const mixed = cadShxVisualLine('חתך 1.5 ממ');
    expect(mixed).toContain('1.5');
    expect(mixed).not.toContain('5.1');
    expect(cadShxVisualLine('כבל 2.5 ממ')).toContain('2.5');
    expect(cadShxVisualLine('מוליך 3x1.5')).toContain('3x1.5');
    expect(cadShxVisualLine('כבל N2XY 4x150')).toContain('N2XY');
    expect(cadShxVisualLine('כבל N2XY 4x150')).toContain('4x150');
    expect(cadShxVisualLine('ROOM 101')).toBe('ROOM 101');
    expect(cadShxVisualLine('12.5')).toBe('12.5');
  });
});
