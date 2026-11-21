import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyLegendText } from '@/modules/electrical-takeoff/domain/legend-identity';

type DumpRow = {
  key: string;
  signature?: string;
  text: string;
  planCount: number;
  planBlocks?: Record<string, number>;
};

type Dump = {
  geometric: number;
  legendRows: number;
  samples?: { rows: DumpRow[] }[];
  topCounts?: DumpRow[];
};

function collectRows(dump: Dump): DumpRow[] {
  const byKey = new Map<string, DumpRow>();
  for (const row of dump.topCounts ?? []) byKey.set(row.key, row);
  for (const sample of dump.samples ?? []) {
    for (const row of sample.rows) byKey.set(row.key, row);
  }
  return [...byKey.values()];
}

describe('3643 stored legend dump — auto vs manual without a new DWG run', () => {
  it('classifies stored legend rows with the live legend-identity rules', () => {
    const dump = JSON.parse(
      readFileSync('docs/audits/3643-legend-identity-dump-2026-11-21.json', 'utf8'),
    ) as Dump;
    expect(dump.geometric).toBe(1702);
    const rows = collectRows(dump);
    const bySignature = new Map<string, Set<string>>();
    for (const row of rows) {
      const signature = (row.signature ?? '').trim().toLowerCase();
      if (!signature) continue;
      const set = bySignature.get(signature) ?? new Set<string>();
      set.add(row.text.replace(/\s+/g, ' ').trim());
      bySignature.set(signature, set);
    }

    let auto = 0;
    let conflict = 0;
    let linear = 0;
    let note = 0;
    let siteWork = 0;
    let mixedBlocks = 0;
    for (const row of rows) {
      const text = row.text.replace(/\s+/g, ' ').trim();
      const kind = classifyLegendText(text);
      const signature = (row.signature ?? '').trim().toLowerCase();
      const textsForSig = signature ? bySignature.get(signature)?.size ?? 1 : 1;
      const blockCount = Object.keys(row.planBlocks ?? {}).length;
      if (textsForSig > 1) {
        conflict += row.planCount;
        continue;
      }
      if (kind === 'device' && blockCount > 1) {
        mixedBlocks += row.planCount;
        continue;
      }
      if (kind === 'device') auto += row.planCount;
      else if (kind === 'linear') linear += row.planCount;
      else if (kind === 'site_work') siteWork += row.planCount;
      else note += row.planCount;
    }

    const covered = auto + conflict + linear + note + siteWork + mixedBlocks;
    const unmatched = dump.geometric - covered;
    expect({
      geometric: dump.geometric,
      dumpRows: rows.length,
      auto,
      conflict,
      linear,
      note,
      siteWork,
      mixedBlocks,
      unmatched,
    }).toEqual({
      geometric: 1702,
      dumpRows: 46,
      auto: 621,
      conflict: 74,
      linear: 91,
      note: 51,
      siteWork: 163,
      mixedBlocks: 0,
      unmatched: 702,
    });
  });
});
