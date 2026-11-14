import { createHash } from 'node:crypto';

import type { SymbolLibraryEntry, WorkerDetection } from './contracts';
import { normalizePlannerKey } from './planner-key';

export type LibraryMatchInput = {
  readonly signature: string;
  readonly signatureKind: WorkerDetection['signatureKind'];
};

export function blockSignature(blockName: string): string {
  const name = blockName.trim() || 'unknown';
  return `block:${name.toLowerCase()}`;
}

export function legendKeySignature(legendKey: string): string {
  const key = legendKey.trim();
  const hash = createHash('sha1').update(key, 'utf8').digest('hex').slice(0, 16);
  return `legend:${hash}`;
}

export function shapeSignatureFromMaskB64(maskB64: string): string {
  const norm = maskB64.trim();
  const hash = createHash('sha1').update(norm, 'utf8').digest('hex');
  return `shape:${hash}`;
}

/**
 * Build a planner-scoped library entry from a detection the user confirmed/reclassified.
 * PDF-shape needs `maskB64` from the engine (legend row / cluster mask). If missing, lead must add
 * `maskB64` on WorkerDetection or pass it from legend entry artifacts.
 */
export function buildLibraryEntry(input: {
  readonly id: string;
  readonly plannerKey: string;
  readonly detection: Pick<WorkerDetection, 'signature' | 'signatureKind' | 'rawClass' | 'blockName' | 'legendKey' | 'maskB64'>;
  readonly typeKey: string;
  readonly label?: string;
  readonly maskB64?: string | null;
  readonly colorHex?: string | null;
  readonly createdAtIso?: string;
}): SymbolLibraryEntry {
  const planner = normalizePlannerKey(input.plannerKey);
  let signature = input.detection.signature;
  let signatureKind = input.detection.signatureKind;

  if (input.detection.signatureKind === 'dwg-block' && input.detection.blockName) {
    signature = blockSignature(input.detection.blockName);
    signatureKind = 'dwg-block';
  } else if (input.detection.legendKey) {
    signature = legendKeySignature(input.detection.legendKey);
    signatureKind = 'legend-key';
  }

  const mask = input.detection.maskB64 ?? input.maskB64 ?? null;
  if (mask && signatureKind !== 'dwg-block') {
    signature = shapeSignatureFromMaskB64(mask);
    signatureKind = 'pdf-shape';
  }

  const template =
    signatureKind === 'pdf-shape' && mask
      ? { size: 64 as const, maskB64: mask, colorHex: input.colorHex ?? null }
      : null;

  return {
    id: input.id,
    plannerKey: planner,
    signatureKind,
    signature,
    template: template ?? undefined,
    typeKey: input.typeKey,
    label: input.label ?? input.detection.rawClass,
    createdAtIso: input.createdAtIso,
  };
}

export function findLibraryMatch(
  library: readonly SymbolLibraryEntry[],
  plannerKey: string,
  probe: LibraryMatchInput,
): SymbolLibraryEntry | null {
  const pk = normalizePlannerKey(plannerKey);
  for (const entry of library) {
    if (normalizePlannerKey(entry.plannerKey) !== pk) continue;
    if (entry.signature === probe.signature && entry.signatureKind === probe.signatureKind) return entry;
  }
  return null;
}

export function libraryWinsOverLegend(entry: SymbolLibraryEntry | null): boolean {
  return entry !== null;
}