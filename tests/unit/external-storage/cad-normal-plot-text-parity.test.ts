import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('CAD Normal vs Plot text parity (WASM JSON)', () => {
  it(
    '3096-EL has the same text keys in Normal and Plot',
    () => {
    const script = path.join(
      process.cwd(),
      'docs/audits/local-tool-artifacts/cad-audit/p-text-normal-plot.mjs',
    );
    const out = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    const match = out.match(/\{[\s\S]*\}/);
    expect(match).not.toBeNull();
    const json = JSON.parse(match![0]!);
    expect(json.textTotalNormal).toBe(json.textTotalPlot);
    expect(json.onlyNormal).toBe(0);
    expect(json.onlyPlot).toBe(0);
    expect(json.gpuMarkedNormal).toBe(0);
    },
    130_000,
  );
});
