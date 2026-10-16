import {
  lookupInIndex,
  normalizeCadPath,
  type CadIndexedFile,
  type FileIndex,
} from './xref-resolver';

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

/** Host paths whose sibling folders should be searched for fonts (host + XREF directories). */
export function fontSearchHostPaths(
  hostPath: string,
  xrefPaths?: ReadonlyArray<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (path: string) => {
    const norm = normalizeCadPath(path);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };

  push(hostPath);
  const hostNorm = normalizeCadPath(hostPath);
  const hostDir = hostNorm.includes('/')
    ? hostNorm.slice(0, hostNorm.lastIndexOf('/'))
    : hostNorm;
  if (hostDir) push(hostDir);

  for (const xref of xrefPaths ?? []) {
    const trimmed = xref.trim();
    if (!trimmed) continue;
    const norm = normalizeCadPath(trimmed);
    push(norm);
    if (norm.includes('/')) {
      push(norm.slice(0, norm.lastIndexOf('/')));
    }
  }

  return out;
}

export function lookupFontInIndex(
  index: FileIndex,
  hostPath: string,
  fontFile: string,
): CadIndexedFile | null {
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

/** Try font lookup from the host drawing folder and each XREF folder on the search path. */
export function lookupFontAcrossSearchPaths(
  index: FileIndex,
  hostPaths: readonly string[],
  fontFile: string,
): CadIndexedFile | null {
  for (const hostPath of hostPaths) {
    const hit = lookupFontInIndex(index, hostPath, fontFile);
    if (hit) return hit;
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
  /** Resolved XREF paths from compat report — search their folders for SHX/TTF siblings. */
  xrefPaths?: ReadonlyArray<string>;
}): Promise<{ resolved: ResolvedCadFont[]; missingFonts: string[] }> {
  const names = Object.keys(input.fonts ?? {}).filter((n) => n.trim().length > 0);
  const resolved: ResolvedCadFont[] = [];
  const missingFonts: string[] = [];
  const searchHosts = fontSearchHostPaths(input.hostPath, input.xrefPaths);

  await Promise.all(
    names.map(async (name) => {
      const hit = lookupFontAcrossSearchPaths(input.fileIndex, searchHosts, name);
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
