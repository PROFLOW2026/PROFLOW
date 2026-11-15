import { describe, expect, it } from 'vitest';
import {
  formatTakeoffDisplayName,
  sanitizeWorkerSheetName,
} from '@/modules/electrical-takeoff/domain/format-display-name';

describe('formatTakeoffDisplayName', () => {
  it('returns Hebrew strings unchanged', () => {
    expect(formatTakeoffDisplayName('עמוד 3')).toBe('עמוד 3');
  });

  it('decodes UTF-8 read as Latin-1', () => {
    const mojibake = Buffer.from('עמוד 1', 'utf8').toString('latin1');
    expect(formatTakeoffDisplayName(mojibake)).toBe('עמוד 1');
  });

  it('keeps ASCII filenames', () => {
    expect(formatTakeoffDisplayName('electrical-plan.pdf')).toBe('electrical-plan.pdf');
  });
});

describe('sanitizeWorkerSheetName', () => {
  it('replaces Autodesk educational watermark with a neutral sheet label', () => {
    expect(sanitizeWorkerSheetName('PRODUCED BY AN AUTODESK EDUCATIONAL PRODUCT', 2)).toBe('גיליון 3');
  });
});