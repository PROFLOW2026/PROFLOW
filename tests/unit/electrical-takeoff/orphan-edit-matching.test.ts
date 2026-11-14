import { describe, expect, it } from 'vitest';
import { matchDetectionForEdit, remapEditsToNewDetections } from '@/modules/electrical-takeoff/application/orphan-edit-matching';
import type { TakeoffEdit, WorkerDetection } from '@/modules/electrical-takeoff/domain/contracts';

const det = (id: string, x: number, y: number): WorkerDetection => ({
  id,
  sheetKey: 'p1',
  fileId: 'f1',
  source: 'pdf',
  x,
  y,
  w: 10,
  h: 10,
  signature: 'shape:abc',
  signatureKind: 'pdf-shape',
  rawClass: 'L1',
  typeKey: 'light.recessed',
  classifiedBy: 'library',
  confidence: 'high',
  reasons: [],
});

describe('orphan edit matching', () => {
  it('remaps by signature and nearby position', () => {
    const prior = [det('a#1', 100, 200)];
    const next = [det('a#9', 110, 205)];
    const edits: TakeoffEdit[] = [{ op: 'confirm', detectionIds: ['a#1'] }];
    const { remapped, orphans } = remapEditsToNewDetections(edits, prior, next);
    expect(orphans).toHaveLength(0);
    expect(remapped[0]).toEqual({ op: 'confirm', detectionIds: ['a#9'] });
  });

  it('keeps orphan when no match', () => {
    const prior = [det('a#1', 100, 200)];
    const next = [det('b#1', 500, 500)];
    const edit: TakeoffEdit = { op: 'reclassify', detectionId: 'a#1', typeKey: 'power.socket', saveToLibrary: false };
    const m = matchDetectionForEdit(edit, prior, next);
    expect(m.orphan).toBe(true);
  });
});