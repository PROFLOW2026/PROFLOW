import { describe, expect, it } from 'vitest';
import { symbolLibraryEntrySchema } from '@/modules/electrical-takeoff/domain/contracts';
import { symbolLibraryForWorker } from '@/modules/electrical-takeoff/application/symbol-library-request';

describe('planner symbol library sent on the next analysis', () => {
  it('turns an upserted mask row into the worker template', () => {
    const [entry] = symbolLibraryForWorker([
      {
        id: 'lib-1',
        plannerKey: '7155',
        signatureKind: 'pdf-shape',
        signature: 'shape:abc',
        template: { maskB64: 'AQID', colorHex: '#112233' },
        typeKey: 'control.switch',
        label: 'סמל ללא סווג',
        createdAt: new Date('2026-11-15T08:00:00.000Z'),
      },
    ]);
    expect(symbolLibraryEntrySchema.parse(entry)).toMatchObject({
      signatureKind: 'pdf-shape',
      signature: 'shape:abc',
      typeKey: 'control.switch',
      template: { size: 64, maskB64: 'AQID', colorHex: '#112233' },
    });
  });

  it('drops a row the worker cannot match', () => {
    const entries = symbolLibraryForWorker([
      {
        id: 'bad',
        plannerKey: '7155',
        signatureKind: 'unknown',
        signature: 'shape:x',
        template: null,
        typeKey: 'control.switch',
        createdAt: new Date('2026-11-15T08:00:00.000Z'),
      },
    ]);
    expect(entries).toEqual([]);
  });
});
