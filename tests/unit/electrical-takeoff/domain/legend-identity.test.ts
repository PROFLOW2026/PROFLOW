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

  it('does not treat an earthing weld as an electrical accessory just because it says נקודה', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:w'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({
        key: 'row:w',
        decodedText: 'מבוצעת ע"פ התקן הישראלי. נקודת ריתוך בין 2 מוליכי טבעת הארקת יסוד',
        signature: 'block:WP',
      }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('site_work');
    expect(identity.source).toBe('uncertain');
  });

  it('still treats a lighting point as a device', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:p'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:p', decodedText: 'נקודת מאור חירום', signature: 'block:36e' }),
    ]);
    expect(identity.unambiguous).toBe(true);
    expect(identity.holdReason).toBe('none');
  });

  it('does not count a cable specification as accessories', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:c'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:c', decodedText: '(4x150) N2XY+70CU', signature: 'block:cable' }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('linear');
    expect(identity.originalText).toBe('(4x150) N2XY+70CU');
    expect(identity.source).toBe('uncertain');
  });

  it('keeps a manufacturer prefix with a socket noun as a device name', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:e'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:e', decodedText: 'תוצרת אלקטרולייט שקע יחיד', signature: 'block:so' }),
    ]);
    expect(identity.unambiguous).toBe(true);
    expect(identity.holdReason).toBe('none');
    expect(identity.originalText).toBe('תוצרת אלקטרולייט שקע יחיד');
  });

  it('does not treat an installation note that mentions a socket as a socket quantity', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:n'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({
        key: 'row:n',
        decodedText: 'מיקום סופי עפ"י תוכנית יועץ בטיחות שקע טלפון כבאים',
        signature: 'block:nfpa72',
      }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('note');
  });

  it('does not treat oven-prep instructions as counted sockets', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:o'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({
        key: 'row:o',
        decodedText: 'הכנה לתנור חימום צינור מ"מ +מוליכים גמר בשקע',
        signature: 'block:33e',
      }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('note');
  });

  it('does not treat a manufacturer-only legend row as a fixture name', () => {
    const detection = applyEdits(
      [workerDet({ id: 'a', sheetKey: 'p1', typeKey: null, classifiedBy: 'none', legendRowIds: ['row:m'], reasons: ['unclassified'] })],
      [],
    )[0]!;
    const identity = resolveLegendIdentity(detection, [
      legend({ key: 'row:m', decodedText: 'תוצרת אלקטרולייט', signature: 'block:note' }),
    ]);
    expect(identity.unambiguous).toBe(false);
    expect(identity.holdReason).toBe('note');
    expect(identity.originalText).toBe('תוצרת אלקטרולייט');
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
  it('holds a legend row that was attached to more than one block', () => {
    const rows = enrichDetectionsWithLegendIdentity(
      applyEdits(
        [
          workerDet({
            id: 'a',
            sheetKey: 'p1',
            typeKey: null,
            classifiedBy: 'none',
            signature: 'block:lu24',
            legendRowIds: ['row:c'],
            reasons: ['unclassified'],
          }),
          workerDet({
            id: 'b',
            sheetKey: 'p1',
            typeKey: null,
            classifiedBy: 'none',
            signature: 'block:*u172',
            legendRowIds: ['row:c'],
            reasons: ['unclassified'],
          }),
        ],
        [],
      ),
      [legend({ key: 'row:c', decodedText: 'מפסק מאור', signature: 'block:lu24' })],
    );
    expect(rows[0]?.legendUnambiguous).toBe(false);
    expect(rows[1]?.legendUnambiguous).toBe(false);
    expect(rows[0]?.originalText).toBe('מפסק מאור');
  });

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

  it('does not treat a catalog type_ambiguous flag as a legend conflict when the planner text is unique', () => {
    const base = workerDet({
      id: 'a',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'low',
      legendRowIds: ['row:1'],
      reasons: ['unclassified', 'legend_unmapped', 'type_ambiguous'],
    });
    const [row] = enrichDetectionsWithLegendIdentity(applyEdits([base], []), [
      legend({ key: 'row:1', decodedText: 'בית תקע חד פאזי 16 אמפר מוגן מים' }),
    ]);
    expect(row?.legendUnambiguous).toBe(true);
    expect(row?.needsReview).toBe(false);
    expect(row?.identitySource).toBe('legend');
    expect(row?.originalText).toBe('בית תקע חד פאזי 16 אמפר מוגן מים');
    expect(hasLegendQuantityIdentity(row!)).toBe(true);
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
