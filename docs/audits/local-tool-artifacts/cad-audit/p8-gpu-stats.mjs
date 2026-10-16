import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';

const glue = await import(
  pathToFileURL(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm.js')).href
);
const w = glue.initSync({
  module: fs.readFileSync(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm_bg.wasm')),
});

function put(bytes) {
  const p = w.alloc(bytes.length);
  new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
  return p;
}
function str(s) {
  const b = new TextEncoder().encode(s);
  return [put(b), b.length];
}

w.clear_xref_deps();
w.set_p8_gpu_text_handoff(1);
const host = `${fx}/3096-EL/3096-EL.dwg`;
const depsDir = `${fx}/3096-EL`;
w.set_host_path(...str(depsDir.replace(/\\/g, '/')));
for (const f of fs.readdirSync(depsDir)) {
  if (!f.toLowerCase().endsWith('.dwg') || f === '3096-EL.dwg') continue;
  const full = `${depsDir}/${f}`;
  const data = fs.readFileSync(full);
  w.add_xref_dep(...str(full), put(data), data.length);
}
w.set_space(...str('*Model_Space'));
const data = fs.readFileSync(host);
const nFloats = w.build_dl(put(data), data.length);
const json = JSON.parse(
  new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
);
const triLen = w.tris_len();
const segStride = json.segmentStride ?? 8;
const _triStride = json.triangleStride ?? 10;
const texts = json.texts ?? [];
const gpuMarked = texts.filter((t) => t.gpu === true).length;
const out = {
  gpuTexts: json.gpuTexts ?? null,
  gpuMarked,
  textTotal: texts.length,
  segmentCount: json.segmentCount,
  triangleCount: json.triangleCount,
  nFloats,
  triFloats: triLen,
  segStride,
  hatchRendered: json.report?.rendered?.Hatch,
  whiteSegs: (() => {
    const segs = new Float32Array(w.memory.buffer, w.segs_ptr(), nFloats);
    let white = 0;
    const dv = new DataView(new ArrayBuffer(4));
    for (let i = 0; i < nFloats; i += segStride) {
      dv.setFloat32(0, segs[i + 4], true);
      const c = dv.getUint32(0, true);
      if (c === 0xffffff) white += 1;
    }
    return white;
  })(),
};
console.log(JSON.stringify(out, null, 2));
