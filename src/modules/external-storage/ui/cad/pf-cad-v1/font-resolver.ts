import { lookupInIndex, normalizeCadPath, type FileIndex } from './xref-resolver';

export type ResolvedCadFont = {
  /** Font file name as reported by the WASM engine (e.g. `sivan.shx`). */
  name: string;
  bytes: Uint8Array;
};

/** Stable signature for XREF/font dependency sets (path + byte length). */
export function cadDepsSignature(
  hostPath: string,
  deps: ReadonlyArray<{ path: string; bytes: Uint8Array | ArrayBuffer }>,
): string {
  const parts = [normalizeCadPath(hostPath)];
  for (const dep of deps) {
    const len =
      dep.bytes instanceof ArrayBuffer
        ? dep.bytes.byteLength
        : dep.bytes.byteLength;
    parts.push(`${normalizeCadPath(dep.path)}:${len}`);
  }
  return parts.join('\0');
}

function fontLookupPath(fontFile: string): string {
  const trimmed = fontFile.trim();
  if (!trimmed) return trimmed;
  if (/\.(shx|ttf|otf|ttc)$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.shx`;
}

export function lookupFontInIndex(
  index: FileIndex,
  hostPath: string,
  fontFile: string,
): { name: string; getBytes: () => Promise<Uint8Array> } | null {
  const candidates = [
    fontFile,
    fontLookupPath(fontFile),
    fontFile.replace(/\.shx$/i, '.ttf'),
  ];
  for (const candidate of candidates) {
    const hit = lookupInIndex(index, hostPath, candidate);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/**
 * Resolve font bytes from storage siblings for each key in `report.fonts`.
 * Returns resolved fonts for optional future worker registration and `missingFonts` for UI banners.
 */
export async function resolveCadFontsFromStorage(input: {
  fonts: Record<string, number> | undefined;
  hostPath: string;
  fileIndex: FileIndex;
}): Promise<{ resolved: ResolvedCadFont[]; missingFonts: string[] }> {
  const names = Object.keys(input.fonts ?? {}).filter((n) => n.trim().length > 0);
  const resolved: ResolvedCadFont[] = [];
  const missingFonts: string[] = [];

  await Promise.all(
    names.map(async (name) => {
      const hit = lookupFontInIndex(input.fileIndex, input.hostPath, name);
      if (!hit) {
        missingFonts.push(name);
        return;
      }
      try {
        const bytes = await hit.getBytes();
        resolved.push({ name, bytes });
      } catch {
        missingFonts.push(name);
      }
    }),
  );

  missingFonts.sort((a, b) => a.localeCompare(b));
  return { resolved, missingFonts };
}

export function mergeMissingFontsIntoReport<T extends { missingFonts?: string[] }>(
  report: T,
  missingFonts: string[],
): T {
  return { ...report, missingFonts };
}
