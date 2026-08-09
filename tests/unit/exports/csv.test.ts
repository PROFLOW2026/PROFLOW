import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv } from '@/modules/exports/domain/csv';

describe('csv helpers', () => {
  it('escapes commas quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('emits utf-8 bom and crlf rows for excel-friendly hebrew', () => {
    const csv = rowsToCsv(['name', 'amount'], [['פרויקט', '12.50'], ['plain', null]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('name,amount\r\n');
    expect(csv).toContain('פרויקט,12.50\r\n');
    expect(csv).toContain('plain,\r\n');
  });
});
