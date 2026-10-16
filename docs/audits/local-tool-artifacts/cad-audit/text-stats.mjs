// Read-only audit: run prebuilt pf-cad-wasm on a DWG and print aggregate text stats.
import fs from 'node:fs';
import { initSync } from '../../../../public/pf-cad/wasm/pf_cad_wasm.js';

const file = process.argv[2];
const w = initSync({ module: fs.readFileSync(new URL('../../../../public/pf-cad/wasm/pf_cad_wasm_bg.wasm', import.meta.url)) });
w.clear_xref_deps();
w.set_host_path(w.alloc(0), 0);
w.set_space(w.alloc(0), 0);
const bytes = fs.readFileSync(file);
const ptr = w.alloc(bytes.length);
new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
const t0 = performance.now();
w.build_dl(ptr, bytes.length);
const ms = performance.now() - t0;
const scene = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())));
if (scene.error) { console.log('error', scene.error); process.exit(0); }
const T = scene.texts;
const cnt = (f) => T.filter(f).length;
const heb = /[\u0590-\u05FF]/;
const stats = {
  file: file.split(/[\\/]/).pop(),
  parseMs: Math.round(ms),
  texts: T.length,
  rendered: scene.report.rendered,
  skippedTextLike: Object.fromEntries(Object.entries(scene.report.skipped).filter(([k]) => /Text|Attrib|Leader|Table|Tolerance|Shape/i.test(k))),
  pctPct: cnt((t) => t.t.includes('%%')),
  pctCodes: [...new Set(T.flatMap((t) => t.t.match(/%%(\d{3}|.)/gi) ?? []).map((s) => s.toLowerCase()))],
  stackArtifactS: cnt((t) => /(^|[^A-Za-z])S[^;]*[\/#^][^;]*;/.test(t.t)),
  leftoverBackslash: cnt((t) => t.t.includes('\\')),
  leftoverSemicolon: cnt((t) => /;/.test(t.t)),
  hebrew: cnt((t) => heb.test(t.t)),
  hebrewMixedDigits: cnt((t) => heb.test(t.t) && /\d/.test(t.t)),
  rotZero: cnt((t) => Math.abs(t.r) < 1e-9),
  rotNear90: cnt((t) => Math.abs(Math.abs(((t.r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI / 2)) < 1e-3 || Math.abs((((t.r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - 3 * Math.PI / 2) < 1e-3),
  rotNearPi: cnt((t) => Math.abs((((t.r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI) < 1e-3),
  emptyOrSpace: cnt((t) => !t.t.trim()),
  longOneLine: cnt((t) => t.t.length > 60),
  heightQuantiles: (() => { const h = T.map((t) => t.h).sort((a, b) => a - b); const q = (p) => h[Math.floor((h.length - 1) * p)]; return h.length ? [q(0), q(0.25), q(0.5), q(0.75), q(1)].map((v) => +v.toPrecision(3)) : []; })(),
};
console.log(JSON.stringify(stats, null, 1));
const pick = (f, n) => T.filter(f).slice(0, n).map((t) => ({ t: t.t.slice(0, 50), h: +t.h.toPrecision(3), r: +t.r.toFixed(3) }));
console.log('samples %%:', JSON.stringify(pick((t) => t.t.includes('%%'), 4)));
console.log('samples S-stack:', JSON.stringify(pick((t) => /(^|[^A-Za-z])S[^;]*[\/#^][^;]*;/.test(t.t), 4)));
console.log('samples backslash:', JSON.stringify(pick((t) => t.t.includes('\\'), 4)));
console.log('samples hebrew:', JSON.stringify(pick((t) => heb.test(t.t), 4)));
console.log('samples long:', JSON.stringify(pick((t) => t.t.length > 60, 2)));
