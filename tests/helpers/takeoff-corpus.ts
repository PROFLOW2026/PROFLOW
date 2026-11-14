import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TakeoffCorpusFiles {
  readonly pdfLegend: string;
  readonly pdfLighting: string;
  readonly dwg: string;
}

function walkFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (ent.isFile()) out.push(full);
  }
}

/** Locates Owner 7155 corpus under Downloads/FW__… folders (read-only). */
export function resolveTakeoffCorpusFiles(): TakeoffCorpusFiles | null {
  const root = process.env.TAKEOFF_CORPUS_ROOT?.trim() || path.join(os.homedir(), 'Downloads');
  if (!existsSync(root)) return null;
  const files: string[] = [];
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('FW__')) continue;
    walkFiles(path.join(root, ent.name), files);
  }
  const pick = (suffix: string) => files.find((p) => p.replaceAll('\\', '/').endsWith(suffix));
  const pdfLegend = pick('7155-A1-מקרא.pdf');
  const pdfLighting = pick('7155-A1-תאורה ג.pdf');
  const dwg = pick('7155-A1.dwg');
  if (!pdfLegend || !pdfLighting || !dwg) return null;
  try {
    if (statSync(pdfLegend).size < 100) return null;
  } catch {
    return null;
  }
  return { pdfLegend, pdfLighting, dwg };
}