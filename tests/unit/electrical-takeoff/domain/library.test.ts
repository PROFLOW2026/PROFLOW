import { describe, expect, it } from 'vitest';

import { blockSignature, buildLibraryEntry, findLibraryMatch, shapeSignatureFromMaskB64 } from '@/modules/electrical-takeoff/domain/library';
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
    expect(entry.signatureKind).toBe('pdf-shape');
    expect(entry.template?.maskB64).toBe('AQIDBA==');
    expect(entry.signature).toBe(shapeSignatureFromMaskB64('AQIDBA=='));
  });
});