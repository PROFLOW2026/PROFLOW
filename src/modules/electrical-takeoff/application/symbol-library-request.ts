import type { SymbolLibraryEntry } from '../domain/contracts';

const SIGNATURE_KINDS = new Set<SymbolLibraryEntry['signatureKind']>(['pdf-shape', 'dwg-block', 'legend-key']);

/** Row already stored by the planner-library upsert. No new table. */
export interface StoredSymbolLibraryRow {
  readonly id: string;
  readonly plannerKey: string;
  readonly signatureKind: string;
  readonly signature: string;
  readonly template: unknown;
  readonly typeKey: string;
  readonly label?: string | null;
  readonly createdAt: Date;
}

/**
 * Planner library rows the worker loads on the next job.
 * A stored mask without `size` is still a 64×64 template — that is what the PDF engine matches.
 */
export function symbolLibraryForWorker(
  rows: readonly StoredSymbolLibraryRow[],
  archivedTypeKeys: ReadonlySet<string> = new Set(),
): SymbolLibraryEntry[] {
  const out: SymbolLibraryEntry[] = [];
  for (const row of rows) {
    if (!SIGNATURE_KINDS.has(row.signatureKind as SymbolLibraryEntry['signatureKind'])) continue;
    const signature = row.signature.trim();
    const typeKey = row.typeKey.trim();
    const plannerKey = row.plannerKey.trim();
    if (!signature || !typeKey || !plannerKey) continue;
    if (archivedTypeKeys.has(typeKey)) continue;
    const stored = splitStoredTemplate(row.template);
    out.push({
      id: row.id,
      plannerKey,
      signatureKind: row.signatureKind as SymbolLibraryEntry['signatureKind'],
      signature,
      ...(stored.template ? { template: stored.template } : {}),
      ...(stored.geometryHash ? { geometryHash: stored.geometryHash } : {}),
      typeKey,
      ...(row.label?.trim() ? { label: row.label.trim() } : {}),
      createdAtIso: row.createdAt.toISOString(),
    });
  }
  return out;
}

export function splitStoredTemplate(template: unknown): {
  template?: SymbolLibraryEntry['template'];
  geometryHash?: string;
} {
  if (!template || typeof template !== 'object') return {};
  const raw = template as { maskB64?: unknown; colorHex?: unknown; geometryHash?: unknown };
  const geometryHash = typeof raw.geometryHash === 'string' && raw.geometryHash.trim().length >= 8 ? raw.geometryHash.trim() : undefined;
  if (typeof raw.maskB64 !== 'string' || raw.maskB64.trim() === '') {
    return geometryHash ? { geometryHash } : {};
  }
  return {
    template: {
      size: 64,
      maskB64: raw.maskB64,
      colorHex: typeof raw.colorHex === 'string' ? raw.colorHex : null,
    },
    ...(geometryHash ? { geometryHash } : {}),
  };
}

export function libraryTemplateForStorage(entry: Pick<SymbolLibraryEntry, 'template' | 'geometryHash'>): Record<string, unknown> | null {
  const stored: Record<string, unknown> = {};
  if (entry.template) {
    stored.size = entry.template.size;
    stored.maskB64 = entry.template.maskB64;
    if (entry.template.colorHex) stored.colorHex = entry.template.colorHex;
  }
  if (entry.geometryHash?.trim()) stored.geometryHash = entry.geometryHash.trim();
  return Object.keys(stored).length > 0 ? stored : null;
}
