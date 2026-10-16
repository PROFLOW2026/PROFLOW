import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixtureRoot =
  process.env.PF_CAD_FIXTURES ??
  'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const host3096 = path.join(fixtureRoot, '3096-EL', '3096-EL.dwg');
const wasmDir = path.join(process.cwd(), 'public/pf-cad/wasm');
const hasFixture = fs.existsSync(host3096) && fs.existsSync(path.join(wasmDir, 'pf_cad_wasm.js'));

describe.skipIf(!hasFixture)('cad P9 WASM smoke (3096-EL)', () => {
  it('emit_multileader contributes segments (WebGL path uses same buffer as lines)', async () => {
    const glue = await import(pathToFileURL(path.join(wasmDir, 'pf_cad_wasm.js')).href);
    const w = glue.initSync({
      module: fs.readFileSync(path.join(wasmDir, 'pf_cad_wasm_bg.wasm')),
    });
    function put(bytes: Uint8Array) {
      const p = w.alloc(bytes.length);
      new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
      return p;
    }
    function str(s: string) {
      const b = new TextEncoder().encode(s);
      return [put(b), b.length] as const;
    }
    w.set_p8_gpu_text_handoff(1);
    w.set_host_path(...str(path.dirname(host3096).replace(/\\/g, '/')));
    w.set_space(...str('*Model_Space'));
    const data = fs.readFileSync(host3096);
    w.build_dl(put(data), data.length);
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
    ) as {
      segmentCount: number;
      report: { rendered: Record<string, number> };
    };
    const ml = json.report.rendered.MultiLeader ?? json.report.rendered.MLeader ?? 0;
    expect(ml).toBeGreaterThan(0);
    expect(json.segmentCount).toBeGreaterThan(0);
  });
});
