/**
 * Local audit: Normal vs Plot text-key parity for a DWG host + XREF deps.
 *
 * Paths are portable (no machine-specific absolute roots):
 *   - Repo root: process.cwd() (run from ProjectFlow root)
 *   - Host DWG: CLI arg, PF_CAD_HOST, or PF_CAD_FIXTURES/3096-EL/3096-EL.dwg
 *   - Deps dir: PF_CAD_DEPS_DIR, or same directory as the host
 *
 * Example:
 *   node docs/audits/local-tool-artifacts/cad-audit/p-text-normal-plot.mjs
 *   node docs/audits/local-tool-artifacts/cad-audit/p-text-normal-plot.mjs path/to/host.dwg
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const wasmDir = path.join(root, 'public/pf-cad/wasm');

function resolveHostAndDeps() {
  const cliHost = process.argv[2]?.trim();
  const envHost = process.env.PF_CAD_HOST?.trim();
  const fixtureRoot = process.env.PF_CAD_FIXTURES?.trim();
  const candidates = [
    cliHost,
    envHost,
    fixtureRoot ? path.join(fixtureRoot, '3096-EL', '3096-EL.dwg') : null,
    path.join(root, 'tmp-3096-el', '3096-EL.dwg'),
  ].filter((value) => Boolean(value));

  for (const host of candidates) {
    const resolved = path.resolve(host);
    if (!fs.existsSync(resolved)) continue;
    const depsDir = process.env.PF_CAD_DEPS_DIR?.trim()
      ? path.resolve(process.env.PF_CAD_DEPS_DIR)
      : path.dirname(resolved);
    return { host: resolved, depsDir };
  }

  throw new Error(
    [
      'CAD host DWG not found.',
      'Pass a path argument, set PF_CAD_HOST, set PF_CAD_FIXTURES, or place the file under tmp-3096-el/.',
      `Tried: ${candidates.join(', ') || '(none)'}`,
    ].join(' '),
  );
}

function cadTextKey(t) {
  return `${t.x.toFixed(3)}|${t.y.toFixed(3)}|${t.layer}|${t.t.slice(0, 40)}`;
}

function compareNormalPlotTextParity(normal, plot) {
  const normalMap = new Map(normal.texts.map((t) => [cadTextKey(t), t]));
  const plotMap = new Map(plot.texts.map((t) => [cadTextKey(t), t]));
  let onlyNormal = 0;
  let onlyPlot = 0;
  for (const key of normalMap.keys()) {
    if (!plotMap.has(key)) onlyNormal += 1;
  }
  for (const key of plotMap.keys()) {
    if (!normalMap.has(key)) onlyPlot += 1;
  }
  return {
    textTotalNormal: normal.texts.length,
    textTotalPlot: plot.texts.length,
    onlyNormal,
    onlyPlot,
    gpuMarkedNormal: normal.texts.filter((t) => t.gpu).length,
  };
}

const { host, depsDir } = resolveHostAndDeps();

const glue = await import(pathToFileURL(path.join(wasmDir, 'pf_cad_wasm.js')).href);
const w = glue.initSync({
  module: fs.readFileSync(path.join(wasmDir, 'pf_cad_wasm_bg.wasm')),
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
  const hostBase = path.basename(host);
  for (const f of fs.readdirSync(depsDir)) {
    if (!f.toLowerCase().endsWith('.dwg') || f === hostBase) continue;
    const full = path.join(depsDir, f);
    const data = fs.readFileSync(full);
    w.add_xref_dep(...str(full.replace(/\\/g, '/')), put(data), data.length);
  }
  w.set_space(...str('*Model_Space'));
  const data = fs.readFileSync(host);
  w.build_dl(put(data), data.length);
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
  );
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
const parity = compareNormalPlotTextParity(normal, plot);

const nMap = new Map(normal.texts.map((t) => [cadTextKey(t), t]));
const pMap = new Map(plot.texts.map((t) => [cadTextKey(t), t]));

let colorDiff = 0;
let brokenOpaque = 0;
const samples = [];

for (const [, t] of nMap) {
  const u = unpackRgb(t.c);
  if (u.a === 255 && brokenCssHex(t.c).length === 9) brokenOpaque += 1;
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
      host,
      depsDir,
      textTotalNormal: parity.textTotalNormal,
      textTotalPlot: parity.textTotalPlot,
      onlyNormal: parity.onlyNormal,
      onlyPlot: parity.onlyPlot,
      colorDiffSameGeometry: colorDiff,
      packedOpaqueWouldBreakCss: brokenOpaque,
      gpuMarkedNormal: parity.gpuMarkedNormal,
      samples,
    },
    null,
    2,
  ),
);
