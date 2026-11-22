import type { TakeoffEdit, WorkerDetection } from './contracts';
import { listDeletedDetectionIds } from './edits';

/** Legend rows used only to compare meaning, not unstable per-job row hashes. */
export type ConfirmReuseLegendRow = {
  readonly key: string;
  readonly signature: string;
  readonly decodedText?: string | null;
  readonly rawText?: string | null;
};

export type ConfirmReuseSkipReason =
  | 'already_confirmed'
  | 'deleted'
  | 'later_decision'
  | 'source_missing'
  | 'target_missing'
  | 'id_mismatch'
  | 'geometry_mismatch'
  | 'signature_mismatch'
  | 'legend_mismatch'
  | 'source_deleted'
  | 'ambiguous_match';

export type ConfirmReuseSkip = {
  readonly sourceId: string;
  readonly reason: ConfirmReuseSkipReason;
};

export type ConfirmReusePlan = {
  readonly transferIds: string[];
  readonly skipped: ConfirmReuseSkip[];
};

type MatchMark = Pick<WorkerDetection, 'id' | 'sheetKey' | 'signature' | 'x' | 'y'> & {
  legendRowIds?: readonly string[];
  legendKey?: string;
  geometryHash?: string;
  native?: { x: number; y: number };
};

function legendRowIdsKey(mark: MatchMark): string {
  return [...(mark.legendRowIds ?? [])].map((id) => id.trim()).filter(Boolean).sort().join(',');
}

function legendByKey(rows: readonly ConfirmReuseLegendRow[] | undefined): Map<string, ConfirmReuseLegendRow> {
  return new Map((rows ?? []).map((row) => [row.key, row]));
}

function legendFingerprint(
  mark: MatchMark,
  rows: ReadonlyMap<string, ConfirmReuseLegendRow>,
): string | null {
  const ids = [...(mark.legendRowIds ?? [])].map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return `empty:${mark.signature}`;
  const parts: string[] = [];
  for (const id of ids) {
    const row = rows.get(id);
    if (!row) return null;
    const text = row.decodedText?.trim() || row.rawText?.trim() || '';
    parts.push(`${row.signature}::${text}`);
  }
  parts.sort();
  return `n:${ids.length}|${parts.join('|')}`;
}

function legendCompatible(
  source: MatchMark,
  target: MatchMark,
  sourceLegend: ReadonlyMap<string, ConfirmReuseLegendRow>,
  targetLegend: ReadonlyMap<string, ConfirmReuseLegendRow>,
): ConfirmReuseSkipReason | null {
  if (legendRowIdsKey(source) === legendRowIdsKey(target)) return null;
  const sourceFp = legendFingerprint(source, sourceLegend);
  const targetFp = legendFingerprint(target, targetLegend);
  if (!sourceFp || !targetFp || sourceFp !== targetFp) return 'legend_mismatch';
  return null;
}

function sameGeometry(left: MatchMark, right: MatchMark): boolean {
  if (left.sheetKey !== right.sheetKey || left.x !== right.x || left.y !== right.y) return false;
  if (left.native && right.native) {
    return left.native.x === right.native.x && left.native.y === right.native.y;
  }
  return true;
}

function provenMatch(
  source: MatchMark,
  target: MatchMark,
  sourceLegend: ReadonlyMap<string, ConfirmReuseLegendRow>,
  targetLegend: ReadonlyMap<string, ConfirmReuseLegendRow>,
): ConfirmReuseSkipReason | null {
  if (source.id !== target.id) return 'id_mismatch';
  if (source.signature !== target.signature) return 'signature_mismatch';
  if (source.geometryHash && target.geometryHash && source.geometryHash !== target.geometryHash) {
    return 'signature_mismatch';
  }
  if (!sameGeometry(source, target)) return 'geometry_mismatch';
  const legendSkip = legendCompatible(source, target, sourceLegend, targetLegend);
  if (legendSkip) return legendSkip;
  const sourceKey = source.legendKey?.trim() ?? '';
  const targetKey = target.legendKey?.trim() ?? '';
  if (sourceKey && targetKey && sourceKey !== targetKey) return 'legend_mismatch';
  return null;
}

function lastOpByDetection(edits: readonly TakeoffEdit[]): Map<string, TakeoffEdit['op']> {
  const last = new Map<string, TakeoffEdit['op']>();
  for (const edit of edits) {
    if (edit.op === 'confirm') {
      for (const id of edit.detectionIds) last.set(id, 'confirm');
      continue;
    }
    if (
      edit.op === 'delete' ||
      edit.op === 'restore' ||
      edit.op === 'reclassify' ||
      edit.op === 'move' ||
      edit.op === 'assign_legend' ||
      edit.op === 'set_label' ||
      edit.op === 'set_note' ||
      edit.op === 'set_boq_excluded'
    ) {
      last.set(edit.detectionId, edit.op);
    }
  }
  return last;
}

/** Target decisions that must not be overwritten by a reused confirm. */
function blockingTargetIds(edits: readonly TakeoffEdit[]): Set<string> {
  const blocked = new Set<string>();
  const last = lastOpByDetection(edits);
  for (const [id, op] of last) {
    if (op === 'delete' || op === 'move' || op === 'assign_legend') blocked.add(id);
  }
  return blocked;
}

export function confirmedDetectionIds(edits: readonly TakeoffEdit[]): string[] {
  const ids = new Set<string>();
  for (const edit of edits) {
    if (edit.op !== 'confirm') continue;
    for (const id of edit.detectionIds) ids.add(id);
  }
  return [...ids];
}

export function planConfirmReuse(input: {
  readonly sourceDetections: readonly WorkerDetection[];
  readonly sourceEdits: readonly TakeoffEdit[];
  readonly targetDetections: readonly WorkerDetection[];
  readonly targetEdits: readonly TakeoffEdit[];
  readonly sourceLegend?: readonly ConfirmReuseLegendRow[];
  readonly targetLegend?: readonly ConfirmReuseLegendRow[];
  readonly extraConfirmedIds?: readonly string[];
}): ConfirmReusePlan {
  const sourceLegend = legendByKey(input.sourceLegend);
  const targetLegend = legendByKey(input.targetLegend);
  const sourceById = new Map(input.sourceDetections.map((row) => [row.id, row]));
  const targetById = new Map(input.targetDetections.map((row) => [row.id, row]));
  const sourceDeleted = new Set(listDeletedDetectionIds(input.sourceDetections, input.sourceEdits));
  const targetDeleted = new Set(listDeletedDetectionIds(input.targetDetections, input.targetEdits));
  const targetConfirmed = new Set([
    ...confirmedDetectionIds(input.targetEdits),
    ...(input.extraConfirmedIds ?? []),
  ]);
  const targetBlocked = blockingTargetIds(input.targetEdits);
  const skipped: ConfirmReuseSkip[] = [];
  const transfer = new Set<string>();

  for (const sourceId of confirmedDetectionIds(input.sourceEdits)) {
    if (sourceDeleted.has(sourceId)) {
      skipped.push({ sourceId, reason: 'source_deleted' });
      continue;
    }
    const source = sourceById.get(sourceId);
    if (!source) {
      skipped.push({ sourceId, reason: 'source_missing' });
      continue;
    }
    const target = targetById.get(sourceId);
    if (!target) {
      skipped.push({ sourceId, reason: 'target_missing' });
      continue;
    }
    if (targetDeleted.has(target.id)) {
      skipped.push({ sourceId, reason: 'deleted' });
      continue;
    }
    if (targetConfirmed.has(target.id) || transfer.has(target.id)) {
      skipped.push({ sourceId, reason: 'already_confirmed' });
      continue;
    }
    if (targetBlocked.has(target.id)) {
      skipped.push({ sourceId, reason: 'later_decision' });
      continue;
    }
    const duplicateIds = input.targetDetections.filter((row) => row.id === source.id);
    if (duplicateIds.length > 1) {
      skipped.push({ sourceId, reason: 'ambiguous_match' });
      continue;
    }
    const mismatch = provenMatch(source, target, sourceLegend, targetLegend);
    if (mismatch) {
      skipped.push({ sourceId, reason: mismatch });
      continue;
    }
    transfer.add(target.id);
  }

  return {
    transferIds: [...transfer].sort((a, b) => a.localeCompare(b, 'en')),
    skipped,
  };
}

export function buildReusedConfirmEdit(
  detectionIds: readonly string[],
  sourceAnalysisId: string,
): TakeoffEdit | null {
  if (detectionIds.length === 0) return null;
  return {
    op: 'confirm',
    detectionIds: [...detectionIds],
    reusedFromAnalysisId: sourceAnalysisId,
  };
}

export function summarizeConfirmReuseSkips(skipped: readonly ConfirmReuseSkip[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const skip of skipped) {
    counts[skip.reason] = (counts[skip.reason] ?? 0) + 1;
  }
  return counts;
}
