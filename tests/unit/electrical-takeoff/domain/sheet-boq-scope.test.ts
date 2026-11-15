import { describe, expect, it } from 'vitest';
import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { resolveSheetInclusion } from '@/modules/electrical-takeoff/domain/sheet-selection';
import { sheetDto, workerDet } from './fixtures';

describe('computeBoq sheet inclusion', () => {
  const catalog = mergeCatalog();

  it('drops detections on excluded sheets from counted total', () => {
    const sA = sheetDto({ fileId: 'dwg', sheetKey: 'layout:a' });
    const sB = sheetDto({ fileId: 'dwg', sheetKey: 'layout:b' });
    const base = [
      workerDet({ id: 'a#1', sheetKey: 'layout:a', fileId: 'dwg' }),
      workerDet({ id: 'b#1', sheetKey: 'layout:b', fileId: 'dwg' }),
      workerDet({ id: 'b#2', sheetKey: 'layout:b', fileId: 'dwg' }),
    ];
    const files = [{ id: 'dwg', name: 'plan.dwg', kind: 'dwg' as const, sizeBytes: 1, uploadedAtIso: '', sha256: null }];
    const edits = [{ op: 'set_sheet_included' as const, fileId: 'dwg', sheetKey: 'layout:b', included: false }];
    const inclusion = resolveSheetInclusion([sA, sB], files, edits);
    const includedSheetRefIds = new Set([...inclusion.entries()].filter(([, on]) => on).map(([k]) => k));
    const detectionFileIdById = new Map(base.map((d) => [d.id, d.fileId]));
    const detections = applyEdits(base, []);
    const boqAll = computeBoq({
      detections,
      sheets: [sA, sB],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      detectionFileIdById,
    });
    const boqScoped = computeBoq({
      detections,
      sheets: [sA, sB],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      detectionFileIdById,
      includedSheetRefIds,
    });
    expect(boqAll.counting?.countedTotal).toBe(3);
    expect(boqScoped.counting?.countedTotal).toBe(1);
    expect(boqScoped.counting?.excluded.sheetExcluded).toBe(2);
    const excludedAll = computeBoq({
      detections,
      sheets: [sA, sB],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      detectionFileIdById,
      includedSheetRefIds: new Set(),
    });
    expect(excludedAll.counting?.countedTotal).toBe(0);
  });

  it('counts a mark added on an included sheet even though the mark has no file id', () => {
    const sheet = sheetDto({ fileId: 'pdf', sheetKey: 'p1' });
    const base = [workerDet({ id: 'p1#1', sheetKey: 'p1', fileId: 'pdf', typeKey: 'control.switch.single' })];
    const files = [{ id: 'pdf', name: 'plan.pdf', kind: 'pdf' as const, sizeBytes: 1, uploadedAtIso: '', sha256: null }];
    const edits = [
      { op: 'add' as const, tempId: 'user-1', sheetKey: 'p1', x: 10, y: 20, typeKey: 'control.switch.single' },
    ];
    const includedSheetRefIds = new Set(
      [...resolveSheetInclusion([sheet], files, []).entries()].filter(([, on]) => on).map(([k]) => k),
    );
    const detections = applyEdits(base, edits);
    const boq = computeBoq({
      detections,
      sheets: [sheet],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      detectionFileIdById: new Map(base.map((d) => [d.id, d.fileId])),
      includedSheetRefIds,
    });
    const switches = boq.lines.find((line) => line.typeKey === 'control.switch.single');
    expect(switches?.quantity).toBe(2);
    expect(boq.counting?.excluded.sheetExcluded).toBe(0);
  });
});