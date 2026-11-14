import { describe, expect, it } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { parseWorkerResultPayload } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { TAKEOFF_CONTRACT_VERSION } from '@/modules/electrical-takeoff/domain/contracts';

const repoRoot = path.resolve(__dirname, '../../..');
const takeoffTmp = path.join(repoRoot, 'takeoff-worker', '.tmp');
const committedNull = path.join(repoRoot, 'tests', 'fixtures', 'electrical-takeoff', 'worker-result-null-filled.json');

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadWireJson(filePath: string): Promise<unknown> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  raw.contractVersion = TAKEOFF_CONTRACT_VERSION;
  return raw;
}

describe('worker result ingest (real wire JSON)', () => {
  it('parses committed null-filled fuzz fixture', async () => {
    const body = await loadWireJson(committedNull);
    const result = parseWorkerResultPayload(body);
    expect(result.detections.length).toBeGreaterThan(0);
    expect(result.sheets[0]?.scale.note).toBeUndefined();
    expect(result.legend[0]?.decodedText).toBeUndefined();
  });

  const corpusCases: { case: string; file: string }[] = [
    { case: '7155_light_g', file: '7155_light_g.json' },
    { case: 'dwg_3031_sw', file: 'dwg_3031_sw.json' },
    { case: '2267', file: '2267.json' },
  ];

  const requireCorpus = process.env.TAKEOFF_REQUIRE_CORPUS_FIXTURES === '1';

  for (const { case: name, file } of corpusCases) {
    it(`parses ${name} wire payload (${file})`, async () => {
      const p = path.join(takeoffTmp, file);
      const present = await fileExists(p);
      if (!present && !requireCorpus) {
        return;
      }
      expect(present, `generate via takeoff-worker: dump_worker_result.py ${name} --out .tmp/${file}`).toBe(true);
      const result = parseWorkerResultPayload(await loadWireJson(p));
      expect(result.contractVersion).toBe(TAKEOFF_CONTRACT_VERSION);
      expect(result.sheets.length).toBeGreaterThan(0);
    });
  }
});