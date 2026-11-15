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
export function symbolLibraryForWorker(rows: readonly StoredSymbolLibraryRow[]): SymbolLibraryEntry[] {
  const out: SymbolLibraryEntry[] = [];
  for (const row of rows) {
    if (!SIGNATURE_KINDS.has(row.signatureKind as SymbolLibraryEntry['signatureKind'])) continue;
    const signature = row.signature.trim();
    const typeKey = row.typeKey.trim();
    const plannerKey = row.plannerKey.trim();
    if (!signature || !typeKey || !plannerKey) continue;
    const template = workerTemplate(row.template);
    out.push({
      id: row.id,
      plannerKey,
      signatureKind: row.signatureKind as SymbolLibraryEntry['signatureKind'],
      signature,
      ...(template ? { template } : {}),
      typeKey,
      ...(row.label?.trim() ? { label: row.label.trim() } : {}),
      createdAtIso: row.createdAt.toISOString(),
    });
  }
  return out;
}

function workerTemplate(template: unknown): SymbolLibraryEntry['template'] {
  if (!template || typeof template !== 'object') return undefined;
  const maskB64 = (template as { maskB64?: unknown }).maskB64;
  if (typeof maskB64 !== 'string' || maskB64.trim() === '') return undefined;
  const colorHex = (template as { colorHex?: unknown }).colorHex;
  return {
    size: 64,
    maskB64,
    colorHex: typeof colorHex === 'string' ? colorHex : null,
  };
}
