import { describe, expect, it } from 'vitest';
import { sanitizeTakeoffSheetXrefsForActor } from '@/modules/electrical-takeoff/application/takeoff-analysis-xref-view';
import type { TakeoffActor } from '@/modules/electrical-takeoff/application/access';

const internal = { kind: 'internal', context: {} } as unknown as TakeoffActor;
const external = { kind: 'external', context: {} } as unknown as TakeoffActor;

describe('sanitizeTakeoffSheetXrefsForActor', () => {
  const input = {
    xrefRefs: [{ name: 'vtk-103', path: '.\\15.06.26\\vtk-103.dwg', loaded: true }],
    xrefsMissing: [{ name: 'missing.dwg', path: '.\\secret\\missing.dwg' }],
  };

  it('keeps paths for internal', () => {
    const out = sanitizeTakeoffSheetXrefsForActor(internal, input);
    expect(out.xrefRefs[0]?.path).toBe(input.xrefRefs[0]?.path);
    expect(out.xrefsMissing[0]?.path).toBe(input.xrefsMissing[0]?.path);
  });

  it('strips paths for external contractors', () => {
    const out = sanitizeTakeoffSheetXrefsForActor(external, input);
    expect(out.xrefRefs[0]?.path).toBeNull();
    expect(out.xrefsMissing[0]?.path).toBeNull();
    expect(out.xrefRefs[0]?.name).toBe('vtk-103');
  });
});