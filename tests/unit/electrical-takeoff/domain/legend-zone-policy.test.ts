import { describe, expect, it } from 'vitest';
import type { EffectiveDetection, WorkerLegendEntry } from '@/modules/electrical-takeoff/domain/contracts';
import { applyLegendZonePolicy, firstPlanOccurrenceId } from '@/modules/electrical-takeoff/domain/legend-zone-policy';
import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { enrichDetectionsWithLegendIdentity } from '@/modules/electrical-takeoff/domain/legend-identity';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { buildReviewGroups } from '@/modules/electrical-takeoff/ui/review-guide';
import { workerDet, sheetDto, proximityRuleSet } from './fixtures';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';

function mark(partial: Partial<EffectiveDetection> & Pick<EffectiveDetection, 'id'>): EffectiveDetection {
  return {
    sheetKey: 'layout:F0',
    x: 100,
    y: 100,
    w: 12,
    h: 12,
    typeKey: null,
    origin: 'auto',
    status: 'suggested',
    confidence: 'none',
    reasons: ['unclassified'],
    rawClass: 'block:14e',
    tagText: null,
    signature: 'block:14e',
    source: 'dwg',
    areaId: null,
    needsReview: true,
    ...partial,
  };
}

function legend(partial: Partial<WorkerLegendEntry> & Pick<WorkerLegendEntry, 'key' | 'signature'>): WorkerLegendEntry {
  return {
    fileId: 'dwg',
    sheetKey: 'layout:F0',
    signatureKind: 'dwg-block',
    decodedText: 'מפסק מאור',
    reasons: [],
    ...partial,
  };
}

describe('applyLegendZonePolicy', () => {
  it('tags a dedicated legend sheet and leaves a matching plan mark countable', () => {
    const rows = applyLegendZonePolicy(
      [
        mark({ id: 'legend-only', sheetKey: 'layout:מקרא', x: 40, y: 40, signature: 'block:zz' }),
        mark({ id: 'plan', sheetKey: 'layout:F0', x: 400, y: 400, signature: 'block:zz' }),
      ],
      {
        sheets: [
          sheetDto({ sheetKey: 'layout:מקרא', fileId: 'dwg', name: 'מקרא', kind: 'dwg_layout' }),
          sheetDto({ sheetKey: 'layout:F0', fileId: 'dwg', name: 'F0', kind: 'dwg_layout' }),
        ],
        files: [{ id: 'dwg', name: '3643-EL.dwg' }],
      },
    );
    expect(rows.find((row) => row.id === 'legend-only')?.reasons).toContain('legend_zone');
    expect(rows.find((row) => row.id === 'plan')?.reasons).not.toContain('legend_zone');
  });

  it('tags the legend-table copies on a floor sheet and keeps spread plan copies', () => {
    const table = ['block:14e', 'block:19e', 'block:21e', 'block:1e', 'block:23e'].map((signature, index) =>
      mark({
        id: `table-${index}`,
        signature,
        rawClass: signature,
        x: 900,
        y: 80 + index * 18,
        legendRowIds: [`row:${signature}`],
      }),
    );
    const planCopies = [
      mark({ id: 'plan-1', signature: 'block:14e', rawClass: 'block:14e', x: 120, y: 200, legendRowIds: ['row:block:14e'] }),
      mark({ id: 'plan-2', signature: 'block:14e', rawClass: 'block:14e', x: 340, y: 480, legendRowIds: ['row:block:14e'] }),
      mark({ id: 'plan-3', signature: 'block:14e', rawClass: 'block:14e', x: 510, y: 260, legendRowIds: ['row:block:14e'] }),
    ];
    const rows = applyLegendZonePolicy([...table, ...planCopies], {
      legend: table.map((item) => legend({ key: `row:${item.signature}`, signature: item.signature ?? '' })),
      sheets: [sheetDto({ sheetKey: 'layout:F0', fileId: 'dwg', name: 'F0', kind: 'dwg_layout' })],
      files: [{ id: 'dwg', name: '3643-EL.dwg' }],
    });
    expect(rows.filter((row) => row.id.startsWith('table-')).every((row) => row.reasons.includes('legend_zone'))).toBe(
      true,
    );
    expect(rows.filter((row) => row.id.startsWith('plan-')).every((row) => !row.reasons.includes('legend_zone'))).toBe(
      true,
    );
  });

  it('does not auto-drop an isolated unique accessory when it is not in a legend table', () => {
    const rows = applyLegendZonePolicy(
      [mark({ id: 'only', signature: 'block:nipuz', x: 220, y: 180, legendRowIds: ['row:n'] })],
      {
        legend: [legend({ key: 'row:n', signature: 'block:nipuz', decodedText: 'לחצן ניפוץ' })],
        sheets: [sheetDto({ sheetKey: 'layout:F0', fileId: 'dwg', name: 'F0', kind: 'dwg_layout' })],
        files: [{ id: 'dwg', name: '3643-EL.dwg' }],
      },
    );
    expect(rows[0]?.reasons).not.toContain('legend_zone');
  });

  it('does not retag a stored confirmation', () => {
    const rows = applyLegendZonePolicy(
      [
        mark({
          id: 'done',
          sheetKey: 'layout:מקרא',
          status: 'confirmed',
          needsReview: false,
          reasons: [],
        }),
      ],
      {
        sheets: [sheetDto({ sheetKey: 'layout:מקרא', fileId: 'dwg', name: 'מקרא', kind: 'dwg_layout' })],
        files: [{ id: 'dwg', name: '3643-EL.dwg' }],
      },
    );
    expect(rows[0]?.status).toBe('confirmed');
    expect(rows[0]?.reasons).not.toContain('legend_zone');
  });

  it('keeps legend-only symbols out of BOQ and the review queue', () => {
    const table = ['block:a', 'block:b', 'block:c', 'block:d'].map((signature, index) =>
      workerDet({
        id: `table-${index}`,
        sheetKey: 'layout:F0',
        source: 'dwg',
        typeKey: null,
        classifiedBy: 'none',
        signature,
        rawClass: signature,
        x: 880,
        y: 60 + index * 16,
        legendRowIds: [`row:${signature}`],
        reasons: ['unclassified'],
      }),
    );
    const zoned = applyLegendZonePolicy(applyEdits(table, []), {
      legend: table.map((item) =>
        legend({ key: `row:${item.signature}`, signature: item.signature, decodedText: item.signature }),
      ),
      sheets: [sheetDto({ sheetKey: 'layout:F0', fileId: 'dwg', name: 'F0', kind: 'dwg_layout' })],
      files: [{ id: 'dwg', name: '3643-EL.dwg' }],
    });
    const detections = enrichDetectionsWithLegendIdentity(
      zoned,
      table.map((item) => legend({ key: `row:${item.signature}`, signature: item.signature, decodedText: item.signature })),
    );
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'layout:F0', fileId: 'dwg', name: 'F0', kind: 'dwg_layout' })],
      areas: [],
      catalog: mergeCatalog(),
      ruleSet: proximityRuleSet,
      linear: [],
      state: 'draft',
    });
    expect(detections.every((row) => row.reasons.includes('legend_zone'))).toBe(true);
    expect(buildReviewGroups(detections)).toEqual([]);
    expect(boq.counting?.excluded.legendZone).toBe(4);
    expect(boq.counting?.countedTotal).toBe(0);
  });

  it('prefers a plan occurrence over a legend-table copy when focusing a legend row', () => {
    const id = firstPlanOccurrenceId(
      [
        mark({ id: 'legend-copy', reasons: ['legend_zone'], legendRowIds: ['row:c'] }),
        mark({ id: 'plan-copy', x: 300, y: 300, legendRowIds: ['row:c'] }),
      ],
      (detection) => Boolean(detection.legendRowIds?.includes('row:c')),
    );
    expect(id).toBe('plan-copy');
  });
});
