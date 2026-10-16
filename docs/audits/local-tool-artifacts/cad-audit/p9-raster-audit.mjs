/** P9: aggregate raster image JSON from WASM (3621-EL has RasterImage entities). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const jobs = [
  { label: '3621-EL', host: `${fx}/3621-EL/3621-EL.dwg`, depsDir: `${fx}/3621-EL` },
  { label: '3096-EL', host: `${fx}/3096-EL/3096-EL.dwg`, depsDir: `${fx}/3096-EL` },
];

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

for (const job of jobs) {
  if (!fs.existsSync(job.host)) {
    console.log(JSON.stringify({ label: job.label, skipped: true }, null, 2));
    continue;
  }
  w.clear_xref_deps();
  w.set_p8_gpu_text_handoff(1);
  w.set_host_path(...str(path.dirname(job.host).replace(/\\/g, '/')));
  if (job.depsDir && fs.existsSync(job.depsDir)) {
    for (const f of fs.readdirSync(job.depsDir)) {
      if (!f.toLowerCase().endsWith('.dwg') || f.endsWith(path.basename(job.host))) continue;
      const full = `${job.depsDir}/${f}`;
      const data = fs.readFileSync(full);
      w.add_xref_dep(...str(full), put(data), data.length);
    }
  }
  w.set_space(...str('*Model_Space'));
  const data = fs.readFileSync(job.host);
  w.build_dl(put(data), data.length);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
  );
  const images = json.images ?? [];
  const withClip = images.filter((im) => Array.isArray(im.clip) && im.clip.length >= 3).length;
  console.log(
    JSON.stringify(
      {
        label: job.label,
        imageCount: images.length,
        withClipPolygon: withClip,
        skippedRaster: json.report?.skipped?.RasterImage ?? null,
        renderedMLeader: json.report?.rendered?.MultiLeader ?? json.report?.rendered?.MLeader ?? null,
        sample: images[0] ?? null,
      },
      null,
      2,
    ),
  );
}
