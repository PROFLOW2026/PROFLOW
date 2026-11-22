/**
 * Client-side edit application until `domain/edits.ts` (agent 3) is wired into the mock API.
 * Mirrors the append-only edit log described in contracts.ts.
 */
import type {
  AnalysisView,
  Boq,
  BoqLine,
  EffectiveDetection,
  TakeoffEdit,
} from '../../domain/contracts';
import { isUserExcludedFromBoq } from '../../domain/counting-policy';
import { devicesFromNote } from '../../domain/quantity-notes';

const deletedIds = new Set<string>();

function recomputeBoq(view: AnalysisView, detections: EffectiveDetection[]): Boq {
  const byType = new Map<string, { ids: string[]; devices: number; label: string; category: BoqLine['category'] }>();
  for (const d of detections) {
    if (deletedIds.has(d.id) || isUserExcludedFromBoq(d)) continue;
    const key = d.typeKey ?? '__unclassified__';
    const cat = view.catalog.find((c) => c.key === d.typeKey)?.category ?? 'unknown';
    const label = view.catalog.find((c) => c.key === d.typeKey)?.nameHe ?? 'לא מסווג';
    const row = byType.get(key) ?? { ids: [], devices: 0, label, category: cat };
    row.ids.push(d.id);
    row.devices += devicesFromNote(d.tagText);
    byType.set(key, row);
  }
  const lines: BoqLine[] = [...byType.entries()].map(([typeKey, row]) => ({
    key: `device_count|${typeKey}|null|null|default`,
    typeKey: typeKey === '__unclassified__' ? null : typeKey,
    label: row.label,
    category: row.category,
    lineKind: 'device_count',
    unit: "יח'",
    quantity: row.devices,
    symbolCount: row.ids.length,
    floor: null,
    areaId: null,
    ruleId: 'default',
    detectionIds: row.ids,
    breakdown: {
      high: row.ids.length,
      medium: 0,
      low: 0,
      unclassified: typeKey === '__unclassified__' ? row.ids.length : 0,
      userAdded: 0,
      userConfirmed: 0,
    },
    verified: false,
    excluded: false,
  }));
  const unclassifiedCount = detections.filter(
    (d) => !deletedIds.has(d.id) && !isUserExcludedFromBoq(d) && !d.typeKey,
  ).length;
  const needsReviewCount = detections.filter((d) => !deletedIds.has(d.id) && d.needsReview).length;
  return {
    ...view.boq,
    lines,
    unclassifiedCount,
    needsReviewCount,
    state: view.summary.status === 'approved' ? 'approved' : 'draft',
  };
}

function applyOne(base: EffectiveDetection[], edit: TakeoffEdit): EffectiveDetection[] {
  switch (edit.op) {
    case 'delete':
      deletedIds.add(edit.detectionId);
      return base;
    case 'restore':
      deletedIds.delete(edit.detectionId);
      return base;
    case 'reclassify':
      return base.map((d) =>
        d.id === edit.detectionId
          ? {
              ...d,
              typeKey: edit.typeKey,
              origin: 'user_changed' as const,
              needsReview: edit.typeKey == null,
              reasons: edit.typeKey
                ? d.reasons.filter((r) => r !== 'unclassified' && r !== 'user_excluded')
                : ['unclassified', ...d.reasons.filter((r) => r !== 'unclassified' && r !== 'user_excluded')],
            }
          : d,
      );
    case 'save_legend':
      return base;
    case 'confirm':
      return base.map((d) =>
        edit.detectionIds.includes(d.id)
          ? { ...d, status: 'confirmed' as const, needsReview: false, reasons: [] }
          : d,
      );
    case 'add':
      return [
        ...base,
        {
          id: edit.tempId,
          sheetKey: edit.sheetKey,
          x: edit.x,
          y: edit.y,
          w: 18,
          h: 18,
          typeKey: edit.typeKey,
          origin: 'user_added' as const,
          status: edit.typeKey ? ('confirmed' as const) : ('suggested' as const),
          confidence: 'high' as const,
          reasons: edit.typeKey ? [] : ['unclassified'],
          rawClass: 'manual',
          tagText: null,
          signature: null,
          source: 'manual' as const,
          areaId: null,
          needsReview: edit.typeKey == null,
        },
      ];
    case 'move':
      return base.map((d) => (d.id === edit.detectionId ? { ...d, x: edit.x, y: edit.y } : d));
    case 'set_note':
      return base.map((d) => (d.id === edit.detectionId ? { ...d, tagText: edit.tagText } : d));
    case 'set_label':
      return base.map((d) => (d.id === edit.detectionId ? { ...d, userLabel: edit.label } : d));
    case 'set_boq_excluded':
      return base.map((d) =>
        d.id === edit.detectionId
          ? {
              ...d,
              needsReview: edit.excluded ? false : d.typeKey == null,
              reasons: edit.excluded
                ? (['user_excluded', ...d.reasons.filter((reason) => reason !== 'user_excluded' && reason !== 'unclassified')] as EffectiveDetection['reasons'])
                : ((d.reasons.includes('unclassified') || d.typeKey
                    ? d.reasons.filter((reason) => reason !== 'user_excluded')
                    : ['unclassified', ...d.reasons.filter((reason) => reason !== 'user_excluded')]) as EffectiveDetection['reasons']),
            }
          : d,
      );
    case 'assign_legend':
      return base.map((d) =>
        d.id === edit.detectionId
          ? { ...d, legendRowIds: edit.legendRowId ? [edit.legendRowId] : [], legendKey: edit.legendRowId ?? undefined }
          : d,
      );
    case 'upsert_area':
    case 'delete_area':
    case 'set_floor':
    case 'set_scale':
    case 'set_sheet_included':
    case 'pair_sheets':
    case 'unpair_sheets':
    case 'confirm_plan_review':
      return base;
  }
}

export function applyEditsLocal(view: AnalysisView, edits: TakeoffEdit[]): AnalysisView {
  let detections = [...view.detections];
  let legend = [...(view.legend ?? [])];
  for (const edit of edits) {
    detections = applyOne(detections, edit);
    if (edit.op === 'save_legend') {
      legend = legend.map((row) => (row.key === edit.legendKey ? { ...row, typeKey: edit.typeKey } : row));
    }
  }
  const visible = detections.filter((d) => !deletedIds.has(d.id));
  return {
    ...view,
    detections: visible,
    legend,
    boq: recomputeBoq(view, visible),
    summary: { ...view.summary, revision: view.summary.revision + edits.length },
  };
}

export function resetEditScratch(): void {
  deletedIds.clear();
}