import { describe, expect, it } from 'vitest';
import {
  filterTakeoffSourceCloudFiles,
  isTakeoffSourceCloudFile,
} from '@/modules/electrical-takeoff/domain/takeoff-source-file-filter';

describe('takeoff-source-file-filter', () => {
  it('keeps plan sources', () => {
    expect(isTakeoffSourceCloudFile({ name: 'plans/electrical.pdf', mimeType: 'application/pdf' })).toBe(true);
    expect(isTakeoffSourceCloudFile({ name: 'lighting.dwg', mimeType: 'application/acad' })).toBe(true);
    expect(isTakeoffSourceCloudFile({ name: 'layout.dxf', mimeType: 'application/dxf' })).toBe(true);
  });

  it('drops internal preview and mask artifacts', () => {
    expect(isTakeoffSourceCloudFile({ name: 'legend-mask-p1.png', mimeType: 'image/png' })).toBe(false);
    expect(isTakeoffSourceCloudFile({ name: 'preview-lightg-p1.png', mimeType: 'image/png' })).toBe(false);
    expect(isTakeoffSourceCloudFile({ name: 'dwg_layout_מקרא.png', mimeType: 'image/png' })).toBe(false);
    expect(isTakeoffSourceCloudFile({ name: 'symbol-lib.dwg', mimeType: 'application/acad' })).toBe(false);
    expect(isTakeoffSourceCloudFile({ name: 'takeoff-cache.pdf', mimeType: 'application/pdf' })).toBe(false);
  });

  it('filters listing arrays', () => {
    const files = [
      { name: 'a.pdf', mimeType: 'application/pdf' },
      { name: 'preview-x.png', mimeType: 'image/png' },
    ];
    expect(filterTakeoffSourceCloudFiles(files)).toEqual([files[0]]);
  });
});