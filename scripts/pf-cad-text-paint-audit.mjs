/**
 * Compare parsed DWG text count vs records that would paint (mirror/height/empty gates).
 * Usage: node scripts/pf-cad-text-paint-audit.mjs [path/to/file.dwg]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function mirrorScale(value) {
  if (value === true) return -1;
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0 && value !== 1) {
    return value;
  }
  return 1;
}

function wouldApplyZeroMirror(tx) {
  const mx = mirrorScale(tx.bx);
  const my = mirrorScale(tx.by);
  return mx === 0 || my === 0;
}

function legacyBugZeroMirror(tx) {
  if (tx.bx != null || tx.by != null) {
    const bx = tx.bx ?? 1;
    const by = tx.by ?? 1;
    return bx === 0 || by === 0 || bx === false || by === false;
  }
  return false;
}

async function loadWasm() {
  const wasmDir = path.join(process.cwd(), 'public/pf-cad/wasm');
  const mod = await import(pathToFileURL(path.join(wasmDir, 'pf_cad_wasm.js')).href);
  const wasmBytes = fs.readFileSync(path.join(wasmDir, 'pf_cad_wasm_bg.wasm'));
  return mod.default({ module_or_path: wasmBytes });
}

function parseDwg(w, buf) {
  const ptr = w.alloc(buf.length);
  new Uint8Array(w.memory.buffer, ptr, buf.length).set(buf);
  w.set_space(w.alloc(0), 0);
  w.clear_xref_deps();
  w.set_host_path(w.alloc(0), 0);
  w.build_dl(ptr, buf.length);
  const len = w.json_len();
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), len)),
  );
}

const dwgPath = process.argv[2] ?? path.join(process.cwd(), '3031-SW.dwg');
const w = await loadWasm();
const json = parseDwg(w, fs.readFileSync(dwgPath));
const texts = json.texts ?? [];
const legacyZero = texts.filter(legacyBugZeroMirror).length;
const empty = texts.filter(
  (t) => !t.t?.trim() && (!t.lines || !t.lines.length),
).length;
const invisible = texts.filter((t) => t.invisible).length;
const paintable = texts.length - empty - invisible;

console.log(JSON.stringify({
  file: path.basename(dwgPath),
  schemaVersion: json.schemaVersion,
  parsedTexts: texts.length,
  emptyOrNoLines: empty,
  invisible,
  paintableAfterContentGates: paintable,
  legacyMirrorBugWouldZeroScale: legacyZero,
  fixedMirrorWouldZeroScale: texts.filter(wouldApplyZeroMirror).length,
}, null, 2));
