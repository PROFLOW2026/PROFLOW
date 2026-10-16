/** P9: layout/paper spaces — viewport clip on model content + raster clip JSON. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const host = `${fx}/3621-EL/3621-EL.dwg`;

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
function parseJson() {
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
  );
}

if (!fs.existsSync(host)) {
  console.log(JSON.stringify({ skipped: true, reason: '3621-EL fixture missing' }, null, 2));
  process.exit(0);
}

const depsDir = path.dirname(host);

function loadHostAndXrefs() {
  w.clear_xref_deps();
  w.set_host_path(...str(depsDir.replace(/\\/g, '/')));
  if (fs.existsSync(depsDir)) {
    for (const f of fs.readdirSync(depsDir)) {
      if (!f.toLowerCase().endsWith('.dwg') || f === path.basename(host)) continue;
      const full = path.join(depsDir, f);
      const dep = fs.readFileSync(full);
      w.add_xref_dep(...str(full.replace(/\\/g, '/')), put(dep), dep.length);
    }
  }
}

const data = fs.readFileSync(host);
w.set_p8_gpu_text_handoff(1);
loadHostAndXrefs();
w.set_space(...str('*Model_Space'));
w.build_dl(put(data), data.length);
const modelJson = parseJson();
const spaces = modelJson.spaces ?? [];

const rows = [];
for (const space of spaces) {
  if (space === '*Model_Space') continue;
  loadHostAndXrefs();
  w.set_space(...str(space));
  w.build_dl(put(data), data.length);
  const json = parseJson();
  const images = json.images ?? [];
  const withClip = images.filter((im) => Array.isArray(im.clip) && im.clip.length >= 3);
  rows.push({
    space,
    segmentCount: json.segmentCount ?? 0,
    imageCount: images.length,
    withClipPolygon: withClip.length,
    renderedViewportModel: json.report?.rendered?.['Viewport(model)'] ?? 0,
    sampleClip: withClip[0]?.clip?.length ?? 0,
  });
}

console.log(
  JSON.stringify(
    {
      host: '3621-EL.dwg',
      modelSpace: {
        imageCount: (modelJson.images ?? []).length,
        renderedMLeader: modelJson.report?.rendered?.MultiLeader ?? 0,
        segmentCount: modelJson.segmentCount ?? 0,
      },
      layoutSpaces: rows.sort((a, b) => a.space.localeCompare(b.space)),
    },
    null,
    2,
  ),
);
