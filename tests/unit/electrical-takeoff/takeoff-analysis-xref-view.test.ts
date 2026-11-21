import { describe, expect, it } from 'vitest';
import {
  sanitizeTakeoffLegendForActor,
  sanitizeTakeoffSheetXrefsForActor,
  sanitizeTakeoffWorkerStatsForActor,
} from '@/modules/electrical-takeoff/application/takeoff-analysis-xref-view';
import type { WorkerLegendEntry } from '@/modules/electrical-takeoff/domain/contracts';
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

describe('sanitizeTakeoffLegendForActor', () => {
  const row = {
    key: 'row:abcd',
    fileId: 'f1',
    signature: 'block:12e',
    signatureKind: 'dwg-block',
    decodedText: 'נקודה לטלפון חוץ',
    rawText: 'נקודה לטלפון חוץ',
    path: 'C:\\org\\secret\\plan.dwg',
    downloadUrl: 'https://files.example/plan.dwg',
    previewArtifact: '.\\xref\\host.dwg',
  } as WorkerLegendEntry & { path?: string; downloadUrl?: string };

  it('keeps legend sentences for contractors and strips paths', () => {
    const out = sanitizeTakeoffLegendForActor(external, [row]);
    expect(out[0]?.decodedText).toBe('נקודה לטלפון חוץ');
    expect(out[0]?.signature).toBe('block:12e');
    expect((out[0] as { path?: string }).path).toBeUndefined();
    expect((out[0] as { downloadUrl?: string }).downloadUrl).toBeUndefined();
    expect(out[0]?.previewArtifact).toBeNull();
  });

  it('does not invent a view for a contractor without going through access', () => {
    const kept = sanitizeTakeoffLegendForActor(internal, [row]);
    expect(kept[0]?.decodedText).toBe(row.decodedText);
  });
});

describe('sanitizeTakeoffWorkerStatsForActor', () => {
  const leaky = {
    legend_rows_read: 118,
    workerBuild: 'abc123',
    engineVersions: {
      ezdxf: '1.4.5',
      libredwg: 'C:\\Users\\ERAN YOSEF\\Desktop\\projectflow\\takeoff-worker\\tools\\bin\\dwg2dxf.exe',
    },
    downloadUrl: 'https://files.example/secret.dwg',
  };

  it('redacts host paths for internal actors', () => {
    const out = sanitizeTakeoffWorkerStatsForActor(internal, leaky);
    expect(out.legend_rows_read).toBe(118);
    expect(out.workerBuild).toBe('abc123');
    expect(out.engineVersions).toEqual({ ezdxf: '1.4.5', libredwg: 'dwg2dxf.exe' });
  });

  it('drops path keys and host paths for contractors', () => {
    const out = sanitizeTakeoffWorkerStatsForActor(external, leaky);
    expect(out.legend_rows_read).toBe(118);
    expect(out.downloadUrl).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/Users|Desktop|files\.example/i);
    expect((out.engineVersions as Record<string, string>).libredwg).toBe('dwg2dxf.exe');
  });
});