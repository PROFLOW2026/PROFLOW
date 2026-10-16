/**
 * Build a CAD file index from a local folder (owner storage mirror).
 * Set PF_CAD_STORAGE_DIR — never commit proprietary SHX into the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CAD_SUPPORT = /\.(dwg|dxf|shx|pat|lin|ttf|otf)$/i;

export function collectCadFilesRecursive(rootDir, maxDepth = 4) {
  const out = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
      } else if (ent.isFile() && CAD_SUPPORT.test(ent.name)) {
        out.push(full.replace(/\\/g, '/'));
      }
    }
  }
  walk(rootDir.replace(/\\/g, '/'), 0);
  return out;
}

export async function buildLocalStorageCadIndex(storageDir) {
  const { buildFileIndex } = await import(
    pathToFileURL(
      path.join(
        process.cwd(),
        'src/modules/external-storage/ui/cad/pf-cad/xref-resolver.ts',
      ),
    ).href
  );
  const files = collectCadFilesRecursive(storageDir);
  const indexed = files.map((full) => ({
    name: full,
    getBytes: async () => new Uint8Array(fs.readFileSync(full)),
  }));
  return buildFileIndex(indexed);
}
