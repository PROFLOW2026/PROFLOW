// Scan DWG text JSON for Hebrew decode outcomes (3096 / 3621 / 3031 when present).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const glue = await import(pathToFileURL(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm.js')).href);
const w = glue.initSync({ module: fs.readFileSync(path.join(root, 'public/pf-cad/wasm/pf_cad_wasm_bg.wasm')) });

const jobs = [
  {
    name: '3096-EL',
    host: 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3096-EL/3096-EL.dwg',
    deps: 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3096-EL',
    xref: true,
  },
  {
    name: '3621-EL',
    host: 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3621-EL/3621-EL.dwg',
    deps: 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3621-EL',
    xref: true,
  },
  {
    name: '3031-SW',
    host: `${root}/3031-SW.dwg`,
    deps: null,
    xref: false,
  },
];

function put(bytes) {
  const p = w.alloc(bytes.length);
  new Uint8Array(w.memory.buffer, p, bytes.length).set(bytes);
  return p;
}
function str(s) {
  const b = new TextEncoder().encode(s);
  return [put(b), b.length];
}

const heb = /[\u0590-\u05FF]/;

for (const job of jobs) {
  if (!fs.existsSync(job.host)) {
    console.log(JSON.stringify({ job: job.name, skipped: 'missing host' }));
    continue;
  }
  w.clear_xref_deps();
  w.set_host_path(...str(path.dirname(job.host).replace(/\\/g, '/')));
  if (job.xref && job.deps) {
    for (const f of fs.readdirSync(job.deps)) {
      if (!f.toLowerCase().endsWith('.dwg') || path.basename(job.host) === f) continue;
      const full = `${job.deps}/${f}`;
      const data = fs.readFileSync(full);
      w.add_xref_dep(...str(full.replace(/\\/g, '/')), put(data), data.length);
    }
  }
  w.set_space(...str('*Model_Space'));
  w.build_dl(put(fs.readFileSync(job.host)), fs.statSync(job.host).size);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())));
  const texts = json.texts ?? [];
  let hebrewTexts = 0;
  let gpu = 0;
  let samples = [];
  for (const t of texts) {
    const body = t.t ?? '';
    if (heb.test(body)) hebrewTexts += 1;
    if (t.gpu) gpu += 1;
    if (samples.length < 5 && heb.test(body)) samples.push(body.slice(0, 80));
  }
  console.log(
    JSON.stringify({
      job: job.name,
      textTotal: texts.length,
      hebrewTexts,
      gpuMarked: gpu,
      hebrewSamples: samples,
    }),
  );
}
