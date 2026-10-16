/**
 * P8: WASM text stats + optional SHX GPU merge coverage on 3096-EL (when fixtures exist).
 * Re-execs with tsx so handoff helpers match production TypeScript.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const selfPath = fileURLToPath(import.meta.url);

if (!process.env.PF_CAD_P8_GLYPH_TSX) {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', selfPath],
    { stdio: 'inherit', env: { ...process.env, PF_CAD_P8_GLYPH_TSX: '1' } },
  );
  process.exit(r.status ?? (r.error ? 1 : 0));
}

const root = 'C:/Users/ERAN YOSEF/Desktop/final projects/FINAL-WEB/projectflow';
const fx = 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures';
const host = `${fx}/3096-EL/3096-EL.dwg`;
const depsDir = `${fx}/3096-EL`;

const { applyCadP8GpuTextHandoff } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff.ts')).href
);
const { registerCadShxFonts, clearCadShxFonts } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-shx-registry.ts')).href
);
const {
  countExpectedShxDrawableGlyphs,
  shxTextRecordCoverage,
} = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/shx-text-segments.ts')).href
);
const { shouldDrawTextOnCanvas } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy.ts')).href
);
const { mirrorScale } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/draw-cad-text.ts')).href
);
const { cadTextCanvasPaint } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-text-canvas-color.ts')).href
);

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

function unpackArgb(c) {
  const u = c >>> 0;
  return { a: (u >> 24) & 0xff, r: (u >> 16) & 0xff, g: (u >> 8) & 0xff, b: u & 0xff };
}

function brokenCssHex(c) {
  return `#${(c >>> 0).toString(16).padStart(6, '0')}`;
}

function loadScene() {
  w.clear_xref_deps();
  w.set_p8_gpu_text_handoff(1);
  w.set_plot_mode(0);
  w.set_host_path(...str(depsDir.replace(/\\/g, '/')));
  for (const f of fs.readdirSync(depsDir)) {
    if (!f.toLowerCase().endsWith('.dwg') || f === '3096-EL.dwg') continue;
    const full = `${depsDir}/${f}`;
    const data = fs.readFileSync(full);
    w.add_xref_dep(...str(full), put(data), data.length);
  }
  w.set_space(...str('*Model_Space'));
  const data = fs.readFileSync(host);
  const nFloats = w.build_dl(put(data), data.length);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.json_ptr(), w.json_len())),
  );
  const segments = new Float32Array(w.memory.buffer, w.segs_ptr(), nFloats);
  return { json, segments, nFloats };
}

function loadShxFromDeps() {
  const loaded = [];
  if (!fs.existsSync(depsDir)) return loaded;
  for (const f of fs.readdirSync(depsDir)) {
    if (!/\.shx$/i.test(f)) continue;
    const full = path.join(depsDir, f);
    loaded.push({ name: f, bytes: new Uint8Array(fs.readFileSync(full)) });
  }
  if (loaded.length > 0) {
    clearCadShxFonts();
    registerCadShxFonts(loaded);
  }
  return loaded.map((x) => x.name);
}

if (!fs.existsSync(host)) {
  console.log(
    JSON.stringify(
      {
        skipped: true,
        reason: '3096-EL fixture missing',
        expectedHost: host,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const { json, segments: wasmSegments } = loadScene();
const origin = json.origin ?? [0, 0];
const texts = json.texts ?? [];

let opaquePacked = 0;
let brokenCssWouldHide = 0;
for (const t of texts) {
  const u = unpackArgb(t.c);
  if (u.a === 255) opaquePacked += 1;
  const paint = cadTextCanvasPaint(t.c >>> 0, { plotView: true });
  if (u.a === 255 && brokenCssHex(t.c).length === 9 && paint.globalAlpha === 1) {
    brokenCssWouldHide += 1;
  }
}

const mirrorTrue = texts.filter((t) => mirrorScale(t.bx) === -1 || mirrorScale(t.by) === -1).length;
const canvasFallback = texts.filter((t) => shouldDrawTextOnCanvas(t)).length;
const canvasDrawBefore = texts.filter((t) => shouldDrawTextOnCanvas(t)).length;

const shxNames = loadShxFromDeps();
let merge = null;
let coverageStats = null;

if (shxNames.length > 0) {
  const handoff = applyCadP8GpuTextHandoff(wasmSegments, {
    ...json,
    texts: texts.map((t) => ({ ...t })),
    segmentStride: json.segmentStride ?? 8,
  });
  const after = handoff.scene.texts ?? [];
  const canvasDrawAfter = after.filter((t) => shouldDrawTextOnCanvas(t)).length;
  const gpuMarked = after.filter((t) => t.gpu === true).length;

  let complete = 0;
  let incomplete = 0;
  let expectedGlyphs = 0;
  let segmentStrokes = 0;
  const samples = [];

  for (const tx of after) {
    if (tx.gpu || tx.invisible) continue;
    const cov = shxTextRecordCoverage(tx, origin);
    if (!cov) continue;
    expectedGlyphs += cov.expectedGlyphs;
    segmentStrokes += cov.segmentCount;
    if (cov.gpuComplete) complete += 1;
    else {
      incomplete += 1;
      if (samples.length < 6) {
        samples.push({
          t: tx.t.slice(0, 32),
          style: tx.style,
          expectedGlyphs: cov.expectedGlyphs,
          segmentCount: cov.segmentCount,
        });
      }
    }
  }

  merge = {
    shxFilesLoaded: shxNames.length,
    shxFileNames: shxNames.slice(0, 12),
    wasmSegmentFloats: wasmSegments.length,
    mergedSegmentFloats: handoff.segments.length,
    shxSegmentsAdded: handoff.segments.length - wasmSegments.length,
    gpuMarkedAfterMerge: gpuMarked,
    canvasDrawBefore,
    canvasDrawAfter,
    canvasSkippedByGpu: canvasDrawBefore - canvasDrawAfter,
  };

  coverageStats = {
    shxRecordsAudited: complete + incomplete,
    recordComplete: complete,
    recordIncomplete: incomplete,
    sumExpectedGlyphs: expectedGlyphs,
    sumSegmentStrokes: segmentStrokes,
    drawableGlyphEstimate: after.reduce(
      (n, tx) => n + countExpectedShxDrawableGlyphs(tx, origin),
      0,
    ),
    samples,
  };
}

console.log(
  JSON.stringify(
    {
      host: path.basename(host),
      textTotal: texts.length,
      wasmGpuMarked: texts.filter((t) => t.gpu === true).length,
      opaqueArgbTexts: opaquePacked,
      opaqueNotBrokenCssPaint: brokenCssWouldHide,
      mirrorFlagRecords: mirrorTrue,
      hebrewCanvasFallback: canvasFallback,
      shxMerge: merge,
      glyphCoverage: coverageStats,
    },
    null,
    2,
  ),
);
