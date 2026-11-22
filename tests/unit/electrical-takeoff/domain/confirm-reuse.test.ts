import { describe, expect, it } from 'vitest';
import {
  buildReusedConfirmEdit,
  planConfirmReuse,
  summarizeConfirmReuseSkips,
} from '@/modules/electrical-takeoff/domain/confirm-reuse';
import type { TakeoffEdit, WorkerDetection } from '@/modules/electrical-takeoff/domain/contracts';
import { workerDet } from './fixtures';

function mark(
  id: string,
  extra: Partial<WorkerDetection> = {},
): WorkerDetection {
  return workerDet({
    id,
    sheetKey: 'layout:F0',
    signature: 'block:14e',
    signatureKind: 'dwg-block',
    x: 120,
    y: 80,
    legendRowIds: ['legend:14e'],
    legendKey: 'block:14e',
    ...extra,
  });
}

describe('planConfirmReuse', () => {
  it('transfers a proven id + geometry + legend match and records the source analysis', () => {
    const source = mark('layout:F0#1');
    const plan = planConfirmReuse({
      sourceDetections: [source],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1')],
      targetEdits: [],
    });
    expect(plan.transferIds).toEqual(['layout:F0#1']);
    expect(plan.skipped).toEqual([]);
    expect(buildReusedConfirmEdit(plan.transferIds, '8d99eaa9-fc1d-43cc-a9c4-756bb19282f3')).toEqual({
      op: 'confirm',
      detectionIds: ['layout:F0#1'],
      reusedFromAnalysisId: '8d99eaa9-fc1d-43cc-a9c4-756bb19282f3',
    });
  });

  it('does not match on block name alone', () => {
    const plan = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1', { blockName: '14e', x: 120, y: 80 })],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#99', { blockName: '14e', x: 900, y: 900 })],
      targetEdits: [],
    });
    expect(plan.transferIds).toEqual([]);
    expect(plan.skipped).toEqual([{ sourceId: 'layout:F0#1', reason: 'target_missing' }]);
  });

  it('skips a same id whose geometry or signature changed', () => {
    const moved = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1', { x: 400, y: 80 })],
      targetEdits: [],
    });
    expect(moved.skipped[0]?.reason).toBe('geometry_mismatch');
    const renamed = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1', { signature: 'block:23e' })],
      targetEdits: [],
    });
    expect(renamed.skipped[0]?.reason).toBe('signature_mismatch');
  });

  it('skips a legend-context mismatch and a mark already confirmed or deleted on the target', () => {
    const legend = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1', { legendRowIds: ['legend:other'] })],
      targetEdits: [],
    });
    expect(legend.skipped[0]?.reason).toBe('legend_mismatch');

    const confirmed = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1')],
      targetEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
    });
    expect(confirmed.skipped[0]?.reason).toBe('already_confirmed');

    const deleted = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1')],
      targetEdits: [{ op: 'delete', detectionId: 'layout:F0#1' }],
    });
    expect(deleted.skipped[0]?.reason).toBe('deleted');
  });

  it('does not copy delete or reclassify, and stays idempotent', () => {
    const sourceEdits: TakeoffEdit[] = [
      { op: 'reclassify', detectionId: 'layout:F0#1', typeKey: 'control.switch.single', saveToLibrary: false },
      { op: 'confirm', detectionIds: ['layout:F0#1'] },
      { op: 'delete', detectionId: 'layout:F0#2' },
    ];
    const plan = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1'), mark('layout:F0#2', { x: 10, y: 10 })],
      sourceEdits,
      targetDetections: [mark('layout:F0#1'), mark('layout:F0#2', { x: 10, y: 10 })],
      targetEdits: [],
    });
    expect(plan.transferIds).toEqual(['layout:F0#1']);
    expect(plan.skipped).toEqual([]);
    const edit = buildReusedConfirmEdit(plan.transferIds, '8d99eaa9-fc1d-43cc-a9c4-756bb19282f3');
    expect(edit?.op).toBe('confirm');
    expect(edit && 'typeKey' in edit).toBe(false);

    const again = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#1'] }],
      targetDetections: [mark('layout:F0#1')],
      targetEdits: [],
      extraConfirmedIds: plan.transferIds,
    });
    expect(again.transferIds).toEqual([]);
    expect(again.skipped[0]?.reason).toBe('already_confirmed');
  });

  it('matches legend context by decoded text when per-job row hashes differ', () => {
    const plan = planConfirmReuse({
      sourceDetections: [mark('layout:F0#113', { legendRowIds: ['row:e9124b07ed44f5d1'] })],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#113'] }],
      sourceLegend: [
        { key: 'row:e9124b07ed44f5d1', signature: 'block:14e', decodedText: 'מפסק מאור' },
      ],
      targetDetections: [mark('layout:F0#113', { legendRowIds: ['row:9ea768922fe5b632'] })],
      targetEdits: [],
      targetLegend: [
        { key: 'row:9ea768922fe5b632', signature: 'block:14e', decodedText: 'מפסק מאור' },
      ],
    });
    expect(plan.transferIds).toEqual(['layout:F0#113']);
  });

  it('does not transfer when the legend text itself changed', () => {
    const plan = planConfirmReuse({
      sourceDetections: [mark('layout:F0#113', { legendRowIds: ['row:old'] })],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#113'] }],
      sourceLegend: [{ key: 'row:old', signature: 'block:14e', decodedText: 'מפסק מאור' }],
      targetDetections: [mark('layout:F0#113', { legendRowIds: ['row:new'] })],
      targetEdits: [],
      targetLegend: [{ key: 'row:new', signature: 'block:14e', decodedText: 'שקע יחיד' }],
    });
    expect(plan.transferIds).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe('legend_mismatch');
  });

  it('leaves unverifiable marks untouched and summarizes skip reasons', () => {
    const plan = planConfirmReuse({
      sourceDetections: [mark('layout:F0#1')],
      sourceEdits: [{ op: 'confirm', detectionIds: ['layout:F0#ghost'] }],
      targetDetections: [mark('layout:F0#1')],
      targetEdits: [],
    });
    expect(plan.transferIds).toEqual([]);
    expect(summarizeConfirmReuseSkips(plan.skipped)).toEqual({ source_missing: 1 });
  });
});
