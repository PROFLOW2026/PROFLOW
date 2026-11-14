import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { DEFAULT_RULE_SET, PROXIMITY_SOCKET_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { linearRun, proximityRuleSet, sheetDto, testArea, workerDet } from './fixtures';

describe('computeBoq', () => {
  const catalog = mergeCatalog();

  it('does not count pdf_only on paired sheet until confirm', () => {
    const base = [
      workerDet({ id: 'pdf-u', sheetKey: 'p1', source: 'pdf', reasons: ['pdf_only'] }),
      workerDet({ id: 'dwg-1', sheetKey: 'p1', source: 'dwg', twinId: 't1' }),
      workerDet({ id: 'pdf-m', sheetKey: 'p1', source: 'pdf', twinId: 't1' }),
    ];
    const twinMap = new Map(base.map((d) => [d.id, d.twinId]));
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
    });
    expect(boq.counting?.countedTotal).toBe(1);
    expect(boq.counting?.excluded.pdfOnly).toBe(1);
    expect(boq.warnings.some((w) => w.includes('pdf_only') || w.includes('PDF'))).toBe(true);
  });

  it('counts dwg_only and plain pdf on pdf-only sheet', () => {
    const base = [
      workerDet({ id: 'a', sheetKey: 'p1', source: 'pdf' }),
      workerDet({ id: 'b', sheetKey: 'p1', source: 'pdf', reasons: ['legend_zone'] }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(boq.counting?.countedTotal).toBe(1);
    expect(boq.counting?.excluded.legendZone).toBe(1);
  });

  it('user confirm on pdf_only includes it in quantities', () => {
    const base = [workerDet({ id: 'pdf-u', sheetKey: 'p1', source: 'pdf', reasons: ['pdf_only'] })];
    const boq = computeBoq({
      detections: applyEdits(base, [{ op: 'confirm', detectionIds: ['pdf-u'] }]),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(boq.counting?.countedTotal).toBe(1);
  });

  it('does not double-count PDF/DWG twins', () => {
    const base = [
      workerDet({ id: 'p1#1', sheetKey: 'p1', source: 'pdf', twinId: 'twin-1' }),
      workerDet({ id: 'd1#1', sheetKey: 'p1', source: 'dwg', twinId: 'twin-1' }),
    ];
    const twinMap = new Map(base.map((d) => [d.id, d.twinId]));
    const effective = applyEdits(base, []);
    const boq = computeBoq({
      detections: effective,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
    });
    const socketLines = boq.lines.filter((l) => l.typeKey === 'power.socket.single');
    expect(socketLines).toHaveLength(1);
    expect(socketLines[0]?.quantity).toBe(1);
  });

  it('groups three nearby sockets into one point under proximity rule', () => {
    const base = [
      workerDet({ id: 'a', sheetKey: 'p1', x: 10, y: 10 }),
      workerDet({ id: 'b', sheetKey: 'p1', x: 15, y: 12 }),
      workerDet({ id: 'c', sheetKey: 'p1', x: 12, y: 18 }),
    ];
    const effective = applyEdits(base, []);
    const boq = computeBoq({
      detections: effective,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: proximityRuleSet,
      linear: [],
      state: 'draft',
    });
    const pointLine = boq.lines.find((l) => l.lineKind === 'point_count');
    expect(pointLine?.quantity).toBe(1);
  });

  it('counts three devices separately under count_each default', () => {
    const base = [
      workerDet({ id: 'a', sheetKey: 'p1', x: 10, y: 10 }),
      workerDet({ id: 'b', sheetKey: 'p1', x: 200, y: 200 }),
      workerDet({ id: 'c', sheetKey: 'p1', x: 400, y: 400 }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((l) => l.typeKey === 'power.socket.single');
    expect(line?.quantity).toBe(3);
  });

  it('excludes legend_zone detections from quantities', () => {
    const base = [
      workerDet({ id: 'a', sheetKey: 'p1', reasons: [] }),
      workerDet({ id: 'b', sheetKey: 'p1', reasons: ['legend_zone'] }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((l) => l.typeKey === 'power.socket.single');
    expect(line?.quantity).toBe(1);
  });

  it('uses lineKind from catalog role (fixture vs device)', () => {
    const base = [
      workerDet({ id: 'l', sheetKey: 'p1', typeKey: 'light.recessed', confidence: 'medium' }),
      workerDet({ id: 's', sheetKey: 'p1', typeKey: 'power.socket.single', confidence: 'medium' }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const light = boq.lines.find((l) => l.typeKey === 'light.recessed');
    const socket = boq.lines.find((l) => l.typeKey === 'power.socket.single');
    expect(light?.lineKind).toBe('fixture_count');
    expect(socket?.lineKind).toBe('device_count');
  });

  it('omits linear meters when scale unverified', () => {
    const boq = computeBoq({
      detections: [],
      sheets: [sheetDto({ sheetKey: 'p1', scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' } })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [linearRun(false)],
      state: 'draft',
    });
    expect(boq.lines.some((l) => l.lineKind === 'length')).toBe(false);
    expect(boq.warnings.some((w) => w.includes('קנה מידה'))).toBe(true);
  });

  it('marks verified only when approved and clean', () => {
    const base = [workerDet({ id: 'a', sheetKey: 'p1', confidence: 'high' })];
    const boqDraft = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [linearRun(true)],
      state: 'draft',
    });
    expect(boqDraft.lines.every((l) => !l.verified)).toBe(true);

    const boqApproved = computeBoq({
      detections: applyEdits(base, [{ op: 'confirm', detectionIds: ['a'] }]),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [linearRun(true)],
      state: 'approved',
    });
    expect(boqApproved.lines.some((l) => l.verified)).toBe(true);
  });

  it('splits by floor and area', () => {
    const d1 = workerDet({ id: 'a', sheetKey: 'p1', x: 50, y: 50 });
    const d2 = workerDet({ id: 'b', sheetKey: 'p2', x: 50, y: 50, fileId: 'f2' });
    const boq = computeBoq({
      detections: applyEdits([d1, d2], [], { areas: [testArea] }),
      sheets: [
        sheetDto({ sheetKey: 'p1', floorLabel: 'קומה 1' }),
        sheetDto({ sheetKey: 'p2', fileId: 'f2', floorLabel: 'קומה 2' }),
      ],
      areas: [testArea],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const floors = new Set(boq.lines.map((l) => l.floor));
    expect(floors.has('קומה 1')).toBe(true);
    expect(floors.has('קומה 2')).toBe(true);
    const inArea = boq.lines.find((l) => l.areaId === 'area-a');
    expect(inArea?.quantity).toBe(1);
  });
});

describe('PROXIMITY_SOCKET_RULE_SET', () => {
  it('is exported for project templates', () => {
    expect(PROXIMITY_SOCKET_RULE_SET.rules.length).toBeGreaterThan(0);
  });
});