import type {
  DetectionOrigin,
  DetectionStatus,
  EffectiveDetection,
  TakeoffArea,
  TakeoffConfidence,
  TakeoffEdit,
  TakeoffReviewReason,
  WorkerDetection,
} from './contracts';
import { pointInPolygon } from './geometry';

export type ApplyEditsContext = {
  readonly areas?: readonly TakeoffArea[];
  readonly floorBySheet?: ReadonlyMap<string, string | null>;
};

type MutableRow = {
  deleted: boolean;
  confirmed: boolean;
  userChangedType: boolean;
  userAdded: boolean;
  origin: DetectionOrigin;
  status: DetectionStatus;
  typeKey: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: TakeoffConfidence;
  reasons: TakeoffReviewReason[];
  tagText: string | null;
  source: EffectiveDetection['source'];
  rawClass: string;
  signature: string | null;
  native: { x: number; y: number } | null;
  legendRowIds: string[];
  legendKey: string | undefined;
  classifiedBy: WorkerDetection['classifiedBy'] | undefined;
  maskB64: string | undefined;
  colorHex: string | undefined;
  userLabel: string | null;
};

export function deriveNeedsReview(input: {
  readonly reasons: readonly TakeoffReviewReason[];
  readonly confidence: TakeoffConfidence;
  readonly typeKey: string | null;
  readonly status: DetectionStatus;
  readonly userChangedType: boolean;
  readonly legendUnambiguous?: boolean;
}): boolean {
  if (input.status === 'confirmed') return false;
  if (input.userChangedType && input.typeKey !== null && input.confidence !== 'none') return false;
  if (input.legendUnambiguous) {
    return input.reasons.some(
      (reason) =>
        reason === 'type_ambiguous' ||
        reason === 'possible_duplicate' ||
        reason === 'pdf_dwg_mismatch' ||
        reason === 'sheet_unassigned' ||
        reason === 'xref_missing' ||
        reason === 'legend_text_undecodable' ||
        reason === 'dynamic_block_unresolved',
    );
  }
  if (input.reasons.length > 0) return true;
  if (input.typeKey === null) return true;
  if (input.confidence === 'low' || input.confidence === 'none') return true;
  return false;
}

function detectionSource(d: WorkerDetection): EffectiveDetection['source'] {
  if (d.twinId) return 'merged';
  if (d.source === 'pdf' || d.source === 'dwg') return d.source;
  return d.source;
}

function toRow(d: WorkerDetection): MutableRow {
  return {
    deleted: false,
    confirmed: false,
    userChangedType: false,
    userAdded: false,
    origin: 'auto',
    status: 'suggested',
    typeKey: d.typeKey,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    confidence: d.confidence,
    reasons: [...d.reasons],
    tagText: d.tagText ?? null,
    source: detectionSource(d),
    rawClass: d.rawClass,
    signature: d.signature,
    native: d.native ? { x: d.native.x, y: d.native.y } : null,
    legendRowIds: d.legendRowIds ?? [],
    legendKey: d.legendKey,
    classifiedBy: d.classifiedBy,
    maskB64: d.maskB64,
    colorHex: d.colorHex,
    userLabel: null,
  };
}

/** Deterministic, idempotent: replay edits in order; later wins. */
export function applyEdits(
  baseDetections: readonly WorkerDetection[],
  edits: readonly TakeoffEdit[],
  ctx: ApplyEditsContext = {},
): EffectiveDetection[] {
  const byId = new Map<string, MutableRow>();
  const idRemap = new Map<string, string>(); // tempId -> permanent id

  for (const d of baseDetections) {
    byId.set(d.id, toRow(d));
  }

  for (const edit of edits) {
    switch (edit.op) {
      case 'reclassify': {
        const row = byId.get(edit.detectionId);
        if (!row || row.deleted) break;
        row.typeKey = edit.typeKey;
        row.userChangedType = true;
        row.origin = 'user_changed';
        if (row.status !== 'confirmed') {
          row.status = 'suggested';
        }
        if (edit.typeKey) {
          row.reasons = row.reasons.filter((reason) => reason !== 'unclassified');
        } else if (!row.reasons.includes('unclassified')) {
          row.reasons = ['unclassified', ...row.reasons];
        }
        break;
      }
      case 'save_legend':
        break;
      case 'confirm': {
        for (const id of edit.detectionIds) {
          const row = byId.get(id);
          if (!row || row.deleted) continue;
          row.confirmed = true;
          row.status = 'confirmed';
        }
        break;
      }
      case 'delete': {
        const row = byId.get(edit.detectionId);
        if (row) row.deleted = true;
        break;
      }
      case 'restore': {
        const row = byId.get(edit.detectionId);
        if (row) row.deleted = false;
        break;
      }
      case 'add': {
        const permanentId = edit.tempId;
        idRemap.set(edit.tempId, permanentId);
        byId.set(permanentId, {
          deleted: false,
          confirmed: false,
          userChangedType: false,
          userAdded: true,
          origin: 'user_added',
          status: 'suggested',
          typeKey: edit.typeKey,
          x: edit.x,
          y: edit.y,
          w: 18,
          h: 18,
          confidence: 'high',
          reasons: edit.typeKey ? [] : ['unclassified'],
          tagText: null,
          source: 'manual',
          rawClass: 'user',
          signature: null,
          native: null,
          legendRowIds: [],
          legendKey: undefined,
          classifiedBy: undefined,
          maskB64: undefined,
          colorHex: undefined,
          userLabel: null,
        });
        break;
      }
      case 'move': {
        const row = byId.get(edit.detectionId);
        if (!row || row.deleted) break;
        row.x = edit.x;
        row.y = edit.y;
        row.native = null;
        row.origin = row.userAdded ? 'user_added' : 'user_changed';
        break;
      }
      case 'set_note': {
        const row = byId.get(edit.detectionId);
        if (!row || row.deleted) break;
        row.tagText = edit.tagText;
        row.origin = row.userAdded ? 'user_added' : 'user_changed';
        break;
      }
      case 'set_label': {
        const row = byId.get(edit.detectionId);
        if (!row || row.deleted) break;
        row.userLabel = edit.label.trim();
        row.origin = row.userAdded ? 'user_added' : 'user_changed';
        break;
      }
      case 'assign_legend': {
        const row = byId.get(edit.detectionId);
        if (!row || row.deleted) break;
        row.legendRowIds = edit.legendRowId ? [edit.legendRowId] : [];
        row.legendKey = edit.legendRowId ?? undefined;
        row.origin = row.userAdded ? 'user_added' : 'user_changed';
        break;
      }
      case 'set_floor':
      case 'set_scale':
      case 'upsert_area':
      case 'delete_area':
      case 'set_sheet_included':
      case 'pair_sheets':
      case 'unpair_sheets':
      case 'confirm_plan_review':
        break;
      default: {
        const _exhaustive: never = edit;
        void _exhaustive;
      }
    }
  }

  const floorBySheet = ctx.floorBySheet ?? new Map<string, string | null>();
  const areas = ctx.areas ?? [];

  const active: EffectiveDetection[] = [];
  for (const d of baseDetections) {
    const row = byId.get(d.id);
    if (!row || row.deleted) continue;
    active.push(toEffective(d.id, d.sheetKey, row, areas, floorBySheet));
  }

  // User-added ids that are not in base
  for (const edit of edits) {
    if (edit.op !== 'add') continue;
    const row = byId.get(edit.tempId);
    if (!row || row.deleted) continue;
  }

  const addedIds = new Set<string>();
  for (const edit of edits) {
    if (edit.op === 'add') addedIds.add(edit.tempId);
  }
  for (const id of addedIds) {
    if (baseDetections.some((d) => d.id === id)) continue;
    const row = byId.get(id);
    if (!row || row.deleted) continue;
    let sheetKey = '';
    for (const edit of edits) {
      if (edit.op === 'add' && edit.tempId === id) sheetKey = edit.sheetKey;
    }
    active.push(toEffective(id, sheetKey, row, areas, floorBySheet));
  }

  active.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return active;
}

function resolveAreaId(
  x: number,
  y: number,
  sheetKey: string,
  areas: readonly TakeoffArea[],
): string | null {
  for (const area of areas) {
    if (area.sheetKey !== sheetKey) continue;
    if (pointInPolygon(x, y, area.polygon)) return area.id;
  }
  return null;
}

function toEffective(
  id: string,
  sheetKey: string,
  row: MutableRow,
  areas: readonly TakeoffArea[],
  _floorBySheet: ReadonlyMap<string, string | null>,
): EffectiveDetection {
  const needsReview = deriveNeedsReview({
    reasons: row.reasons,
    confidence: row.confidence,
    typeKey: row.typeKey,
    status: row.status,
    userChangedType: row.userChangedType,
  });
  return {
    id,
    sheetKey,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    typeKey: row.typeKey,
    origin: row.origin,
    status: row.status,
    confidence: row.confidence,
    reasons: row.reasons,
    rawClass: row.rawClass,
    tagText: row.tagText,
    signature: row.signature,
    source: row.source,
    areaId: resolveAreaId(row.x, row.y, sheetKey, areas),
    needsReview,
    ...(row.native ? { native: row.native } : {}),
    ...(row.legendRowIds.length > 0 ? { legendRowIds: row.legendRowIds } : {}),
    ...(row.legendKey ? { legendKey: row.legendKey } : {}),
    ...(row.classifiedBy ? { classifiedBy: row.classifiedBy } : {}),
    ...(row.maskB64 ? { maskB64: row.maskB64 } : {}),
    ...(row.colorHex ? { colorHex: row.colorHex } : {}),
    ...(row.userLabel ? { userLabel: row.userLabel } : {}),
  };
}

/** Deleted detections can be listed for restore UI. */
export function listDeletedDetectionIds(
  baseDetections: readonly WorkerDetection[],
  edits: readonly TakeoffEdit[],
): string[] {
  const deleted = new Set<string>();
  for (const edit of edits) {
    if (edit.op === 'delete') deleted.add(edit.detectionId);
    if (edit.op === 'restore') deleted.delete(edit.detectionId);
  }
  return [...deleted].filter((id) => baseDetections.some((d) => d.id === id)).sort();
}