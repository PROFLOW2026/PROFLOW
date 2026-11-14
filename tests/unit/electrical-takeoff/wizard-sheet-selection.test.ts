import { describe, expect, it } from 'vitest';

import { buildWizardSheetSelection } from '@/modules/electrical-takeoff/ui/wizard-sheet-selection';

describe('buildWizardSheetSelection', () => {
  it('maps PDF files to p1 and DWG tokens to layout keys', () => {
    const files = [
      { fileId: 'p-leg', kind: 'pdf' as const, name: 'מקרא.pdf' },
      { fileId: 'p-plan', kind: 'pdf' as const, name: 'תאורה.pdf' },
      { fileId: 'd1', kind: 'dwg' as const, name: 'plan.dwg' },
    ];
    const selected = new Set(['p-leg', 'p-plan', 'd1']);
    const sel = buildWizardSheetSelection(files, selected, 'מקרא, תאורה ג');
    expect(sel).toEqual([
      { fileId: 'p-leg', sheetKey: 'p1' },
      { fileId: 'p-plan', sheetKey: 'p1' },
      { fileId: 'd1', sheetKey: 'layout:מקרא' },
      { fileId: 'd1', sheetKey: 'layout:תאורה ג' },
    ]);
  });
});