// Classify near-white triangle fills on 3096-EL (wipeout vs hatch vs other).
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
w.build_dl(put(fs.readFileSync(host)), fs.readFileSync(host).length);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())));
const triLen = w.tris_len();
const tris = new Float32Array(w.memory.buffer, w.tris_ptr(), triLen);
const STRIDE = 10;
const n = triLen / STRIDE;
const dv = new DataView(new ArrayBuffer(4));

function rgbKey(c) {
  return c & 0xffffff;
}

const buckets = new Map();
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
let whiteLike = 0;

for (let i = 0; i < n; i++) {
  const base = i * STRIDE;
  for (let k = 0; k < 6; k += 2) {
    minX = Math.min(minX, tris[base + k]);
    maxX = Math.max(maxX, tris[base + k]);
    minY = Math.min(minY, tris[base + k + 1]);
    maxY = Math.max(maxY, tris[base + k + 1]);
  }
  dv.setFloat32(0, tris[base + 6], true);
  const c = dv.getUint32(0, true);
  const rgb = rgbKey(c);
  if (rgb === 0xffffff || rgb === 0xf8f8f8) whiteLike += 1;
  const layer = tris[base + 7];
  const order = tris[base + 9];
  const key = `${rgb.toString(16).padStart(6, '0')}|L${layer}`;
  const prev = buckets.get(key) ?? { count: 0, minOrder: order, maxOrder: order };
  prev.count += 1;
  prev.minOrder = Math.min(prev.minOrder, order);
  prev.maxOrder = Math.max(prev.maxOrder, order);
  buckets.set(key, prev);
}

const top = [...buckets.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 12)
  .map(([k, v]) => ({ key: k, ...v }));

console.log(
  JSON.stringify(
    {
      triangleCount: n,
      whiteLikeRgb: whiteLike,
      triExtent: [minX, minY, maxX, maxY],
      rendered: json.report?.rendered ?? {},
      skipped: json.report?.skipped ?? {},
      topColorLayerBuckets: top,
    },
    null,
    2,
  ),
);
