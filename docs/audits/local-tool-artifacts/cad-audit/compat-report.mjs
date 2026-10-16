// Read-only audit helper: runs prebuilt pf-cad-wasm against local drawings, prints aggregate stats only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const glue = await import(pathToFileURL(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm.js')).href);
const w = glue.initSync({ module: fs.readFileSync(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm_bg.wasm')) });

const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const jobs = [
  { host: `${fx}/3096-EL/3096-EL.dwg`, depsDir: `${fx}/3096-EL` },
  { host: `${fx}/3621-EL/3621-EL.dwg`, depsDir: `${fx}/3621-EL` },
  { host: `${root}/3031-SW.dwg`, depsDir: null },
];
const only = process.argv[2];

function put(bytes) {
  const p = w.alloc(bytes.length);
  new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
  return p;
}
function str(s) {
  const b = new TextEncoder().encode(s);
  return [put(b), b.length];
}

function run(job, space, withDeps) {
  w.clear_xref_deps();
  const dir = path.dirname(job.host).replace(/\\/g, '/');
  w.set_host_path(...str(dir));
  if (withDeps && job.depsDir) {
    for (const f of fs.readdirSync(job.depsDir)) {
      const full = `${job.depsDir}/${f}`;
      if (!f.toLowerCase().endsWith('.dwg') || full === job.host) continue;
      const data = fs.readFileSync(full);
      const [pp, pl] = str(full);
      const rc = w.add_xref_dep(pp, pl, put(data), data.length);
      if (rc !== 0) console.log('  dep fail', f, rc);
    }
  }
  w.set_space(...str(space));
  const data = fs.readFileSync(job.host);
  const t0 = performance.now();
  const n = w.build_dl(put(data), data.length);
  const ms = Math.round(performance.now() - t0);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())));
  const segs = new Float32Array(w.memory.buffer, w.segs_ptr(), n);
  const colors = new Map();
  const layers = new Map();
  let maxAbs = 0;
  const dv = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < n; i += 6) {
    dv.setFloat32(0, segs[i + 4], true);
    const c = dv.getUint32(0, true);
    colors.set(c, (colors.get(c) ?? 0) + 1);
    const l = segs[i + 5];
    layers.set(l, (layers.get(l) ?? 0) + 1);
    for (let k = 0; k < 4; k++) maxAbs = Math.max(maxAbs, Math.abs(segs[i + k]));
  }
  const segCount = n / 6;
  const topColors = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([c, k]) => `${c.toString(16).padStart(6, '0')}:${k}`);
  const layer0 = layers.get(0) ?? 0;
  const layerNames = json.layers ?? [];
  const usedLayers = layers.size;
  return {
    space: json.space, ms, error: json.error, segCount, texts: json.texts?.length,
    layersInTable: layerNames.length, layersUsedBySegs: usedLayers,
    segsOnLayerIdx0: layer0, layerIdx0Name: layerNames[0]?.name,
    origin: json.origin, robustExtent: json.robustExtent, fullExtent: json.fullExtent,
    maxAbsRtcCoord: maxAbs, distinctColors: colors.size, topColors,
    spaces: json.spaces, report: json.report,
    textHeights: (() => {
      const h = (json.texts ?? []).map((t) => t.h).sort((a, b) => a - b);
      return h.length ? [h[0], h[h.length >> 1], h[h.length - 1]] : [];
    })(),
  };
}

for (const job of jobs) {
  if (only && !job.host.includes(only)) continue;
  console.log('=====', path.basename(job.host));
  const base = run(job, '', true);
  console.log(JSON.stringify(base, null, 1));
  if (job.depsDir) {
    const nodeps = run(job, '', false);
    console.log('-- without deps: segCount', nodeps.segCount, 'xrefs', JSON.stringify(nodeps.report.xrefs));
  }
  for (const sp of base.spaces ?? []) {
    if (sp === '*Model_Space') continue;
    const r = run(job, sp, true);
    console.log('-- space', sp, JSON.stringify({ segCount: r.segCount, texts: r.texts, ms: r.ms, report: r.report, topColors: r.topColors }));
  }
}
