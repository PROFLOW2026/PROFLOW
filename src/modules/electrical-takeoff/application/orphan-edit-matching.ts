import type { TakeoffEdit, WorkerDetection } from '../domain/contracts';

export interface EditMatchKey {
  readonly sheetKey: string;
  readonly signature: string;
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_POSITION_TOLERANCE_PX = 24;

/** Stable match across re-analysis: (sheetKey, signature, position) with tolerance fallback. */
export function detectionMatchKey(detection: WorkerDetection): EditMatchKey {
  return { sheetKey: detection.sheetKey, signature: detection.signature, x: detection.x, y: detection.y };
}

export function matchDetectionForEdit(
  edit: TakeoffEdit,
  priorDetections: WorkerDetection[],
  newDetections: WorkerDetection[],
  tolerancePx = DEFAULT_POSITION_TOLERANCE_PX,
): { matchedId: string | null; orphan: boolean } {
  if (edit.op === 'add') return { matchedId: edit.tempId, orphan: false };
  const targetId = 'detectionId' in edit ? edit.detectionId : null;
  if (!targetId) return { matchedId: null, orphan: true };

  const prior = priorDetections.find((d) => d.id === targetId);
  if (!prior) return { matchedId: targetId, orphan: true };

  const key = detectionMatchKey(prior);
  const exact = newDetections.find(
    (d) => d.sheetKey === key.sheetKey && d.signature === key.signature && d.x === key.x && d.y === key.y,
  );
  if (exact) return { matchedId: exact.id, orphan: false };

  const near = newDetections.find(
    (d) =>
      d.sheetKey === key.sheetKey &&
      d.signature === key.signature &&
      Math.hypot(d.x - key.x, d.y - key.y) <= tolerancePx,
  );
  if (near) return { matchedId: near.id, orphan: false };

  return { matchedId: null, orphan: true };
}

export function remapEditsToNewDetections(
  edits: TakeoffEdit[],
  priorDetections: WorkerDetection[],
  newDetections: WorkerDetection[],
): { remapped: TakeoffEdit[]; orphans: TakeoffEdit[] } {
  const remapped: TakeoffEdit[] = [];
  const orphans: TakeoffEdit[] = [];
  for (const edit of edits) {
    if (edit.op === 'confirm') {
      const ids = edit.detectionIds.map((id) => {
        const pseudo: TakeoffEdit = { op: 'confirm', detectionIds: [id] };
        const { matchedId, orphan } = matchDetectionForEdit(
          { op: 'reclassify', detectionId: id, typeKey: null, saveToLibrary: false },
          priorDetections,
          newDetections,
        );
        if (orphan || !matchedId) orphans.push(pseudo);
        return matchedId ?? id;
      });
      if (ids.every((id, i) => id === edit.detectionIds[i])) remapped.push(edit);
      else remapped.push({ op: 'confirm', detectionIds: ids });
      continue;
    }
    if (!('detectionId' in edit)) {
      remapped.push(edit);
      continue;
    }
    const { matchedId, orphan } = matchDetectionForEdit(edit, priorDetections, newDetections);
    if (orphan || !matchedId) {
      orphans.push(edit);
      continue;
    }
    if (matchedId === edit.detectionId) {
      remapped.push(edit);
    } else {
      remapped.push({ ...edit, detectionId: matchedId } as TakeoffEdit);
    }
  }
  return { remapped, orphans };
}