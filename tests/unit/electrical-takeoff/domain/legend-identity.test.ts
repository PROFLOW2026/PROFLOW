import { describe, expect, it } from 'vitest';

import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import {
  enrichDetectionsWithLegendIdentity,
  hasLegendQuantityIdentity,
  resolveLegendIdentity,
} from '@/modules/electrical-takeoff/domain/legend-identity';
import type { WorkerLegendEntry } from '@/modules/electrical-takeoff/domain/contracts';
import { workerDet } from './fixtures';

function legend(partial: Partial<WorkerLegendEntry> & Pick<WorkerLegendEntry, 'key' | 'decodedText'>): WorkerLegendEntry {
  return {
    fileId: 'f1',
    sheetKey: 'layout:F0',
    signature: 'block:stair',
    signatureKind: 'dwg-block',
    rawText: partial.decodedText,
    reasons: [],
    ...partial,
  };
}

describe('resolveLegendIdentity', () => {
  it('uses the planner legend text when one description matches the symbol', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:1'], reasons: ['unclassified', 'legend_unmapped'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:1', decodedText: 'לחצן חדר מדרגות', signature: 'block:stair' }),
    ]);
    expect(identity.unambiguous).toBe(true);
    expect(identity.source).toBe('legend');
    expect(identity.originalText).toBe('לחצן חדר מדרגות');
  });

  it('keeps conflicting descriptions in review', () => {
    const detection = applyEdits(
      [
        workerDet({
          id: 'a',
          sheetKey: 'p1',
          typeKey: null,
          classifiedBy: 'none',
          legendRowIds: ['row:a', 'row:b'],
          reasons: ['type_ambiguous', 'legend_unmapped'],
        }),
      ],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:a', decodedText: 'נקודת מאור חירום', signature: 'block:36e' }),
      legend({ key: 'row:b', decodedText: 'תאורה שקועה במשרד', signature: 'block:36e' }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('conflict');
    expect(identity.source).toBe('uncertain');
  });

  it('treats two legend rows with the same text as one identity', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:1', 'row:2'], reasons: ['legend_unmapped'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:1', decodedText: 'נקודה לטלפון חוץ', signature: 'block:12e' }),
      legend({ key: 'row:2', decodedText: 'נקודה לטלפון חוץ', signature: 'block:12e' }),
    ]);
    expect(identity.unambiguous).toBe(true);
    expect(identity.originalText).toBe('נקודה לטלפון חוץ');
  });

  it('does not treat a floor note as a fixture name', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:n'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:n', decodedText: 'בקומות המבנה', signature: 'block:note' }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('note');
  });

  it('does not auto-count when the sheet is unassigned', () => {
    const detection = applyEdits(
      [
        workerDet({
          id: 'a',
          sheetKey: 'p1',
          typeKey: null,
          classifiedBy: 'none',
          legendRowIds: ['row:1'],
          reasons: ['sheet_unassigned', 'legend_unmapped'],
        }),
      ],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:1', decodedText: 'שקע כוח', signature: 'block:so' }),
    ]);
    expect(identity.originalText).toBe('שקע כוח');
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('sheet_unassigned');
  });
});

describe('enrichDetectionsWithLegendIdentity', () => {
  it('drops guided review for an unambiguous legend match without a catalog type', () => {
    const base = workerDet({
      id: 'a',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'none',
      legendRowIds: ['row:1'],
      reasons: ['unclassified', 'legend_unmapped'],
    });
    const [row] = enrichDetectionsWithLegendIdentity(applyEdits([base], []), [
      legend({ key: 'row:1', decodedText: 'לחצן חדר מדרגות' }),
    ]);
    expect(row?.needsReview).toBe(false);
    expect(hasLegendQuantityIdentity(row!)).toBe(true);
    expect(row?.identitySource).toBe('legend');
  });

  it('does not overwrite a stored manual classification', () => {
    const base = workerDet({
      id: 'a',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      legendRowIds: ['row:1'],
      reasons: ['unclassified'],
    });
    const [row] = enrichDetectionsWithLegendIdentity(
      applyEdits([base], [{ op: 'reclassify', detectionId: 'a', typeKey: 'control.switch.single', saveToLibrary: false }]),
      [legend({ key: 'row:1', decodedText: 'לחצן חדר מדרגות' })],
    );
    expect(row?.typeKey).toBe('control.switch.single');
    expect(row?.identitySource).toBe('manual');
    expect(row?.originalText).toBe('לחצן חדר מדרגות');
    expect(row?.needsReview).toBe(false);
  });
});
