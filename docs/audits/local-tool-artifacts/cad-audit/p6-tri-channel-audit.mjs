// P6: triangle channel stats (count, alpha, hatch coverage) — 3096-EL model + XREFs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const glue = await import(pathToFileURL(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm.js')).href);
const w = glue.initSync({ module: fs.readFileSync(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm_bg.wasm')) });

const host = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3096-EL/3096-EL.dwg';
const depsDir = path.dirname(host);

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
w.set_host_path(...str(depsDir.replace(/\\/g, '/')));
for (const f of fs.readdirSync(depsDir)) {
  if (!f.toLowerCase().endsWith('.dwg') || f === '3096-EL.dwg') continue;
  const full = `${depsDir}/${f}`;
  const data = fs.readFileSync(full);
  w.add_xref_dep(...str(full.replace(/\\/g, '/')), put(data), data.length);
}
w.set_space(...str('*Model_Space'));
const data = fs.readFileSync(host);
const segFloats = w.build_dl(put(data), data.length);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())));
const triLen = w.tris_len();
const tris = new Float32Array(w.memory.buffer, w.tris_ptr(), triLen);
const STRIDE = 10;
const triCount = triLen / STRIDE;
const dv = new DataView(new ArrayBuffer(4));
let alphaNonOpaque = 0;
let whiteFill = 0;
let distinctColors = new Map();
for (let i = 0; i < triCount; i++) {
  const base = i * STRIDE;
  dv.setFloat32(0, tris[base + 6], true);
  const c = dv.getUint32(0, true);
  distinctColors.set(c, (distinctColors.get(c) ?? 0) + 1);
  const aByte = (c >>> 24) & 0xff;
  if (aByte !== 0 && aByte !== 255) alphaNonOpaque += 1;
  const rgb = c & 0xffffff;
  if (rgb === 0xffffff || rgb === 0xf8f8f8) whiteFill += 1;
}
const hatch = json.report?.rendered?.Hatch ?? json.report?.expanded?.Hatch ?? 0;
console.log(
  JSON.stringify(
    {
      engineCommit: JSON.parse(fs.readFileSync(path.join(root, 'public/pf-cad/wasm/version.json'), 'utf8'))
        .engineCommitSha,
      segmentFloats: segFloats,
      segmentStride: json.segmentStride ?? 8,
      triangleCount: triCount,
      triDistinctColors: distinctColors.size,
      triAlphaNonOpaque: alphaNonOpaque,
      triWhiteRgb: whiteFill,
      hatchRendered: hatch,
      gpuTexts: json.gpuTexts ?? null,
    },
    null,
    2,
  ),
);
