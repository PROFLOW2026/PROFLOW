import { describe, expect, it } from 'vitest';
import {
  defaultSheetIncluded,
  isLikelyLegendSheet,
  resolveSheetInclusion,
  sheetNameSimilarity,
  suggestDwgLayoutsForPdf,
} from '@/modules/electrical-takeoff/domain/sheet-selection';
import { sheetDto } from './fixtures';

describe('sheet-selection', () => {
  it('excludes legend sheets by default', () => {
    const legend = sheetDto({ fileId: 'legend', sheetKey: 'p1', name: 'מקרא' });
    const plan = sheetDto({ fileId: 'lightg', sheetKey: 'p1', name: 'תאורה ג' });
    const files = [
      { id: 'legend', name: '7155-legend.pdf', kind: 'pdf' as const, sizeBytes: 1, uploadedAtIso: '', sha256: null },
      { id: 'lightg', name: '7155-light.pdf', kind: 'pdf' as const, sizeBytes: 1, uploadedAtIso: '', sha256: null },
    ];
    expect(isLikelyLegendSheet(legend, files[0]!.name)).toBe(true);
    expect(defaultSheetIncluded(legend, files)).toBe(false);
    expect(defaultSheetIncluded(plan, files)).toBe(true);
  });

  it('set_sheet_included edit overrides default', () => {
    const plan = sheetDto({ fileId: 'dwg', sheetKey: 'layout:תאורה ג' });
    const files = [{ id: 'dwg', name: '7155.dwg', kind: 'dwg' as const, sizeBytes: 1, uploadedAtIso: '', sha256: null }];
    const m = resolveSheetInclusion([plan], files, [
      { op: 'set_sheet_included', fileId: 'dwg', sheetKey: plan.sheetKey, included: false },
    ]);
    expect(m.get('dwg:layout:תאורה ג')).toBe(false);
  });

  it('suggests DWG layouts by Hebrew tail similarity', () => {
    const pdf = sheetDto({ fileId: 'lightg', sheetKey: 'p1', name: 'תאורה ג' });
    const dwgA = sheetDto({ fileId: 'dwg', sheetKey: 'layout:תאורה ג', name: 'תאורה ג', kind: 'dwg_layout' });
    const dwgB = sheetDto({ fileId: 'dwg', sheetKey: 'layout:מקרא', name: 'מקרא', kind: 'dwg_layout' });
    expect(sheetNameSimilarity('7155 תאורה ג', 'layout:תאורה ג')).toBeGreaterThan(0);
    const picks = suggestDwgLayoutsForPdf(pdf, '7155-A1-תאורה ג.pdf', [dwgB, dwgA]);
    expect(picks[0]?.sheetKey).toBe('layout:תאורה ג');
  });
});