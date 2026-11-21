import { describe, expect, it } from 'vitest';

import {
  blockSignature,
  buildLegendLibraryEntry,
  buildLibraryEntry,
  findLibraryMatch,
  legendKeySignature,
  legendTextLibrarySignature,
  shapeSignatureFromMaskB64,
} from '@/modules/electrical-takeoff/domain/library';
import { workerDet } from './fixtures';

describe('library', () => {
  it('round-trips block and shape signatures', () => {
    expect(blockSignature('T20')).toBe('block:t20');
    const sig = shapeSignatureFromMaskB64('AQID');
    expect(sig.startsWith('shape:')).toBe(true);
    const entry = buildLibraryEntry({
      id: 'e1',
      plannerKey: 'Gav-Yam',
      detection: workerDet({ id: 'x', sheetKey: 'p1', blockName: 'T20', signatureKind: 'dwg-block', signature: 'block:T20' }),
      typeKey: 'power.socket.single',
      maskB64: 'AQID',
    });
    expect(entry.signatureKind).toBe('dwg-block');
    const hit = findLibraryMatch([entry], 'gav yam', { signature: entry.signature, signatureKind: entry.signatureKind });
    expect(hit?.typeKey).toBe('power.socket.single');
    expect(findLibraryMatch([entry], 'other-office', { signature: entry.signature, signatureKind: entry.signatureKind })).toBeNull();
  });

  it('keeps the DWG shape fingerprint with the approved block', () => {
    const entry = buildLibraryEntry({
      id: 'e-geom',
      plannerKey: 'Brandeis',
      detection: workerDet({
        id: 'd',
        sheetKey: 'layout:Layout1',
        source: 'dwg',
        blockName: 'da3',
        signatureKind: 'dwg-block',
        signature: 'block:da3',
        geometryHash: 'block:*geom:b73128bb00000000',
      }),
      typeKey: 'light.point',
    });
    expect(entry.signatureKind).toBe('dwg-block');
    expect(entry.geometryHash).toBe('block:*geom:b73128bb00000000');
    expect(entry.template).toBeUndefined();
  });

  it('uses detection.maskB64 for pdf-shape library save', () => {
    const det = workerDet({
      id: 'd1',
      sheetKey: 'p1',
      signatureKind: 'pdf-shape',
      signature: 'shape:old',
      legendKey: 'L4',
      maskB64: 'AQIDBA==',
    });
    const entry = buildLibraryEntry({
      id: 'e2',
      plannerKey: 'test',
      detection: det,
      typeKey: 'light.recessed',
    });
    expect(entry.signatureKind).toBe('legend-key');
    expect(entry.signature).toBe(legendKeySignature('L4'));
    expect(entry.template?.maskB64).toBe('AQIDBA==');
  });

  it('hashes legend sentence text, not the block or row id', () => {
    const fromText = buildLegendLibraryEntry({
      id: 'e-leg',
      plannerKey: 'office-a',
      legendKey: 'row:ffffffffffff',
      legendText: 'נקודה לטלפון חוץ',
      typeKey: 'comm.phone',
    });
    expect(fromText.signatureKind).toBe('legend-key');
    expect(fromText.signature).toBe(legendTextLibrarySignature('נקודה לטלפון חוץ'));
    expect(fromText.signature).not.toBe(legendKeySignature('row:ffffffffffff'));
    expect(fromText.signature).not.toContain('12e');
    expect(findLibraryMatch([fromText], 'other-office', { signature: fromText.signature, signatureKind: 'legend-key' })).toBeNull();
  });
});