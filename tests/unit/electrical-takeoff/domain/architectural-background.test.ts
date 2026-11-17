import { describe, expect, it } from 'vitest';
import {
  architecturalLayerIndexes,
  backgroundRequestAllowed,
  sameCadFile,
  xrefDependencyPaths,
} from '@/modules/electrical-takeoff/domain/architectural-background';

describe('architectural background', () => {
  it('matches an xref block name to the file in the same folder', () => {
    expect(sameCadFile('1545-Xref-all-02', '1545-Xref-all-02.dwg')).toBe(true);
    expect(sameCadFile('1545-Xref-all-02', '1545-all-01.dwg')).toBe(false);
  });

  it('allows a download only for an xref this analysis recorded', () => {
    const recorded = [{ name: '1545-Xref-all-02', path: 'C:/plans/1545-Xref-all-02.dwg' }];
    expect(backgroundRequestAllowed('1545-Xref-all-02', recorded)).toBe(true);
    expect(backgroundRequestAllowed('other-plan.dwg', recorded)).toBe(false);
  });

  it('selects only the xref layers, so electrical layers stay visible', () => {
    const indexes = architecturalLayerIndexes(
      [
        { index: 1, name: 'E_LIGHT' },
        { index: 2, name: '1545-Xref-all-02|WALL' },
        { index: 3, name: '1545-Xref-all-02|DOOR' },
        { index: 6, name: '1545-Xref-all-02$0$WALL' },
        { index: 4, name: 'E_XREF' },
        { index: 5, name: 'mik-xref$0$L01' },
      ],
      ['1545-Xref-all-02'],
    );
    expect(indexes).toEqual([2, 3, 6]);
  });

  it('registers the relative path stored in 1545-all-01', () => {
    expect(xrefDependencyPaths('1545-Xref-all-02', null)).toContain('.\\1545-Xref-all-02.dwg');
    expect(xrefDependencyPaths('1545-Xref-all-02', null)).toContain('1545-Xref-all-02.dwg');
  });
});
