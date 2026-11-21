import { describe, expect, it } from 'vitest';
import {
  cadCanvasTextLine,
  cadHtmlTextLine,
  cadShxVisualLine,
  shouldApplyCadBackwardsMirror,
} from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-text-bidi';

describe('CAD mixed Hebrew / number order', () => {
  it('does not geometrically mirror Hebrew or digits so 1.5 cannot become 5.1', () => {
    expect(shouldApplyCadBackwardsMirror('חתך 1.5 ממ', true)).toBe(false);
    expect(shouldApplyCadBackwardsMirror('1.5', true)).toBe(false);
    expect(shouldApplyCadBackwardsMirror('ROOM 101', true)).toBe(false);
    expect(shouldApplyCadBackwardsMirror('ROOM', true)).toBe(true);
    expect(shouldApplyCadBackwardsMirror('חתך 1.5 ממ', false)).toBe(false);
  });

  it('keeps decimals, multipliers and cable marks in original order', () => {
    const mixed = cadShxVisualLine('חתך 1.5 ממ');
    expect(mixed).toContain('1.5');
    expect(mixed).not.toContain('5.1');
    expect(cadCanvasTextLine('חתך 1.5 ממ"ר')).toContain('1.5');
    expect(cadCanvasTextLine('חתך 1.5 ממ"ר')).not.toContain('5.1');
    expect(cadShxVisualLine('כבל 2.5 ממ')).toContain('2.5');
    expect(cadShxVisualLine('מוליך 3x1.5')).toContain('3x1.5');
    expect(cadShxVisualLine('כבל 5x2.5')).toContain('5x2.5');
    expect(cadShxVisualLine('כבל N2XY 4x150')).toContain('N2XY');
    expect(cadShxVisualLine('כבל N2XY 4x150')).toContain('4x150');
    expect(cadShxVisualLine('ROOM 101')).toBe('ROOM 101');
    expect(cadShxVisualLine('12.5')).toBe('12.5');
  });

  it('protects canvas fillText so mixed Hebrew cannot reverse 1.5 / 3x1.5', () => {
    const decimal = cadCanvasTextLine('חתך 1.5 ממ');
    const two = cadCanvasTextLine('כבל 2.5 ממ');
    const multiply = cadCanvasTextLine('מוליך 3x1.5');
    expect(decimal).toContain('\u202D1.5\u202C');
    expect(decimal.startsWith('\u202A')).toBe(true);
    expect(decimal).not.toContain('5.1');
    expect(two).toContain('\u202D2.5\u202C');
    expect(two).not.toContain('5.2');
    expect(multiply).toContain('\u202D3x1.5\u202C');
    expect(multiply).not.toContain('5.1x3');
    expect(cadCanvasTextLine('ROOM 101')).toBe('ROOM 101');
  });

  it('isolates stored numbers for RTL without guessing that 5.1 or 02 are reversed', () => {
    const stored = 'צינור 02 + מוליכים 5.1 ממ"ר';
    const html = cadHtmlTextLine(stored);
    expect(html).toContain('\u20665.1\u2069');
    expect(html).toContain('\u206602\u2069');
    expect(html).not.toContain('1.5');
    expect(html).not.toContain('20');
    expect(html.startsWith('צינור')).toBe(true);
    expect(cadCanvasTextLine(stored)).toContain('\u202D5.1\u202C');
    expect(cadCanvasTextLine(stored)).not.toContain('1.5');
    const logical = cadHtmlTextLine('חתך 1.5 ממ"ר');
    expect(logical).toContain('\u20661.5\u2069');
    expect(logical).not.toContain('5.1');
    expect(cadHtmlTextLine(cadHtmlTextLine(stored))).toBe(html);
  });
});
