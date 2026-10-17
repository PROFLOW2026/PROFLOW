/**
 * Optional local regression: real 3096-EL Normal vs Plot WASM parity.
 * Not part of the CI unit project (`tests/unit/**`).
 *
 * Run explicitly when fixtures are available:
 *   npm run test:local:cad-3096-parity
 *
 * Fixture resolution (first hit wins):
 *   1. PF_CAD_FIXTURES/3096-EL/3096-EL.dwg
 *   2. tmp-3096-el/3096-EL.dwg under the repo
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareNormalPlotTextParity } from '../fixtures/cad/normal-plot-parity/compare-text-parity';

const repoRoot = process.cwd();
const wasmDir = path.join(repoRoot, 'public/pf-cad/wasm');

function resolve3096Bundle(): { readonly host: string; readonly depsDir: string } | null {
  const envRoot = process.env.PF_CAD_FIXTURES?.trim();
  const candidates = [
    envRoot ? path.join(envRoot, '3096-EL', '3096-EL.dwg') : null,
    path.join(repoRoot, 'tmp-3096-el', '3096-EL.dwg'),
  ].filter((value): value is string => Boolean(value));

  for (const host of candidates) {
    if (!fs.existsSync(host)) continue;
    return { host, depsDir: path.dirname(host) };
  }
  return null;
}

const bundle = resolve3096Bundle();
const hasWasm =
  fs.existsSync(path.join(wasmDir, 'pf_cad_wasm.js')) &&
  fs.existsSync(path.join(wasmDir, 'pf_cad_wasm_bg.wasm'));

describe('CAD Normal vs Plot text parity (3096-EL local regression)', () => {
  it(
    '3096-EL has the same text keys in Normal and Plot',
    async () => {
      if (!bundle) {
        throw new Error(
          '3096-EL fixture missing. Set PF_CAD_FIXTURES or place 3096-EL.dwg under tmp-3096-el/.',
        );
      }
      if (!hasWasm) {
        throw new Error(`WASM assets missing under ${wasmDir}`);
      }
      const resolved = bundle;

      const glue = await import(pathToFileURL(path.join(wasmDir, 'pf_cad_wasm.js')).href);
      const w = glue.initSync({
        module: fs.readFileSync(path.join(wasmDir, 'pf_cad_wasm_bg.wasm')),
      });

      function put(bytes: Uint8Array) {
        const pointer = w.alloc(bytes.length);
        new Uint8Array(w.memory.buffer, pointer, bytes.length).set(bytes);
        return pointer;
      }
      function str(value: string) {
        const encoded = new TextEncoder().encode(value);
        return [put(encoded), encoded.length] as const;
      }

      function loadHost(plotMode: boolean) {
        w.clear_xref_deps();
        w.set_plot_mode(plotMode ? 1 : 0);
        w.set_host_path(...str(resolved.depsDir.replace(/\\/g, '/')));
        for (const fileName of fs.readdirSync(resolved.depsDir)) {
          if (!fileName.toLowerCase().endsWith('.dwg') || fileName === path.basename(resolved.host)) {
            continue;
          }
          const full = path.join(resolved.depsDir, fileName);
          const data = fs.readFileSync(full);
          w.add_xref_dep(...str(full.replace(/\\/g, '/')), put(data), data.length);
        }
        w.set_space(...str('*Model_Space'));
        const data = fs.readFileSync(resolved.host);
        w.build_dl(put(data), data.length);
        return JSON.parse(
          new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
        ) as { texts: Array<{ x: number; y: number; layer: string; t: string; gpu?: boolean }> };
      }

      const normal = loadHost(false);
      const plot = loadHost(true);
      const result = compareNormalPlotTextParity(normal, plot);
      expect(result.textTotalNormal).toBe(result.textTotalPlot);
      expect(result.onlyNormal).toBe(0);
      expect(result.onlyPlot).toBe(0);
      expect(result.gpuMarkedNormal).toBe(0);
    },
    130_000,
  );
});
