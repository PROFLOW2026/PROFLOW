import type { SymbolLibraryEntry, WorkerDetection } from './contracts';
import { normalizePlannerKey } from './planner-key';
import { sha1Hex } from './sha1';

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
  return `legend:${sha1Hex(key).slice(0, 16)}`;
}

export function shapeSignatureFromMaskB64(maskB64: string): string {
  const norm = maskB64.trim();
  return `shape:${sha1Hex(norm)}`;
}

/**
 * Planner library row for a legend key, including a symbol that has no plan marks.
 * The worker matches `signatureKind` + `signature` on the next analysis.
 */
export function buildLegendLibraryEntry(input: {
  readonly id: string;
  readonly plannerKey: string;
  readonly legendKey: string;
  readonly typeKey: string;
  readonly label?: string;
  readonly createdAtIso?: string;
}): SymbolLibraryEntry {
  const legendKey = input.legendKey.trim();
  const typeKey = input.typeKey.trim();
  return {
    id: input.id,
    plannerKey: normalizePlannerKey(input.plannerKey),
    signatureKind: 'legend-key',
    signature: legendKeySignature(legendKey),
    typeKey,
    label: input.label ?? legendKey,
    createdAtIso: input.createdAtIso,
  };
}

/**
 * Build a planner-scoped library entry from a detection the user confirmed/reclassified.
 * PDF-shape needs `maskB64` from the engine (legend row / cluster mask). If missing, lead must add
 * `maskB64` on WorkerDetection or pass it from legend entry artifacts.
 */
export function buildLibraryEntry(input: {
  readonly id: string;
  readonly plannerKey: string;
  readonly detection: Pick<WorkerDetection, 'signature' | 'signatureKind' | 'rawClass' | 'blockName' | 'legendKey' | 'maskB64' | 'geometryHash'>;
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
  if (mask && signatureKind === 'pdf-shape') {
    signature = shapeSignatureFromMaskB64(mask);
  }

  const template =
    mask && signatureKind !== 'dwg-block'
      ? { size: 64 as const, maskB64: mask, colorHex: input.colorHex ?? null }
      : null;

  const geometryHash = input.detection.geometryHash?.trim() || undefined;
  return {
    id: input.id,
    plannerKey: planner,
    signatureKind,
    signature,
    template: template ?? undefined,
    ...(geometryHash ? { geometryHash } : {}),
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