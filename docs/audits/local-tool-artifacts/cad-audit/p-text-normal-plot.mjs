import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const host = `${fx}/3096-EL/3096-EL.dwg`;
const depsDir = `${fx}/3096-EL`;

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

function loadHost(plotMode) {
  w.clear_xref_deps();
  w.set_plot_mode(plotMode ? 1 : 0);
  w.set_host_path(...str(depsDir.replace(/\\/g, '/')));
  for (const f of fs.readdirSync(depsDir)) {
    if (!f.toLowerCase().endsWith('.dwg') || f === '3096-EL.dwg') continue;
    const full = `${depsDir}/${f}`;
    const data = fs.readFileSync(full);
    w.add_xref_dep(...str(full), put(data), data.length);
  }
  w.set_space(...str('*Model_Space'));
  const data = fs.readFileSync(host);
  w.build_dl(put(data), data.length);
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
  );
}

function textKey(t) {
  return `${t.x.toFixed(3)}|${t.y.toFixed(3)}|${t.layer}|${t.t.slice(0, 40)}`;
}

function unpackRgb(c) {
  const u = c >>> 0;
  return { r: (u >> 16) & 0xff, g: (u >> 8) & 0xff, b: u & 0xff, a: (u >> 24) & 0xff };
}

function brokenCssHex(c) {
  return `#${(c >>> 0).toString(16).padStart(6, '0')}`;
}

const normal = loadHost(false);
const plot = loadHost(true);
const nMap = new Map(normal.texts.map((t) => [textKey(t), t]));
const pMap = new Map(plot.texts.map((t) => [textKey(t), t]));

let onlyNormal = 0;
let onlyPlot = 0;
let colorDiff = 0;
let brokenOpaque = 0;
const samples = [];

for (const [k, t] of nMap) {
  if (!pMap.has(k)) onlyNormal += 1;
  const u = unpackRgb(t.c);
  if (u.a === 255 && brokenCssHex(t.c).length === 9) brokenOpaque += 1;
}
for (const [k] of pMap) {
  if (!nMap.has(k)) onlyPlot += 1;
}

for (const [k, nt] of nMap) {
  const pt = pMap.get(k);
  if (!pt) continue;
  if (nt.c !== pt.c) {
    colorDiff += 1;
    if (samples.length < 8) {
      samples.push({
        k,
        t: nt.t.slice(0, 32),
        normal: unpackRgb(nt.c),
        plot: unpackRgb(pt.c),
        brokenCssNormal: brokenCssHex(nt.c),
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      textTotalNormal: normal.texts.length,
      textTotalPlot: plot.texts.length,
      onlyNormal,
      onlyPlot,
      colorDiffSameGeometry: colorDiff,
      packedOpaqueWouldBreakCss: brokenOpaque,
      gpuMarkedNormal: normal.texts.filter((t) => t.gpu).length,
      samples,
    },
    null,
    2,
  ),
);
