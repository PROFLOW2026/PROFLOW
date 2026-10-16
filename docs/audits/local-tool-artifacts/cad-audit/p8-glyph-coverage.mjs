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

const { appendShxGpuSegments, stripUpstreamClientShxGpuFlags } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/shx-text-segments.ts')).href
);
const { applyCadP8GpuTextHandoff } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff.ts')).href
);
const {
  registerCadShxFonts,
  registerCadShxStyleTable,
  registerCadShxTextStyleAliases,
  registerCadShxEntityStyleHeuristics,
  clearCadShxFonts,
  lookupShxFont,
} =
  await import(
    pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-shx-registry.ts')).href
  );
const { resolveCadFontsFromStorage } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/font-resolver.ts')).href
);
const { buildLocalStorageCadIndex } = await import(
  pathToFileURL(path.join(root, 'docs/audits/local-tool-artifacts/cad-audit/cad-local-storage-index.mjs'))
    .href
);
const {
  cadTextStyleUsesClientShx,
  countExpectedShxDrawableGlyphs,
  isShxTextRecordGpuComplete,
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
const { collectEntityTextStyleDiagnostics } = await import(
  pathToFileURL(path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-entity-text-style.ts'))
    .href
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

function loadShxFromDir(dir) {
  const loaded = [];
  if (!fs.existsSync(dir)) return loaded;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.shx$/i.test(f)) continue;
    const full = path.join(dir, f);
    loaded.push({ name: f, bytes: new Uint8Array(fs.readFileSync(full)) });
  }
  return loaded;
}

function loadShxFromDeps() {
  const syntheticDir = path.join(root, 'tests/fixtures/cad/synthetic-shx');
  const loaded = [...loadShxFromDir(depsDir), ...loadShxFromDir(syntheticDir)];
  const byKey = new Map();
  for (const item of loaded) {
    byKey.set(item.name.toLowerCase(), item);
  }
  const merged = [...byKey.values()];
  if (merged.length > 0) {
    clearCadShxFonts();
    registerCadShxFonts(merged);
  }
  return merged.map((x) => x.name);
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

function shxHandoffMetrics(sceneTexts, origin) {
  let shxStyleResolvable = 0;
  let shxGpuEligible = 0;
  let wasmGpuClientShxIncomplete = 0;
  for (const t of sceneTexts) {
    if (t.invisible) continue;
    if (lookupShxFont(t.style)) shxStyleResolvable += 1;
    if (cadTextStyleUsesClientShx(t) && isShxTextRecordGpuComplete(t, origin)) {
      shxGpuEligible += 1;
    }
    if (t.gpu === true && cadTextStyleUsesClientShx(t) && !isShxTextRecordGpuComplete(t, origin)) {
      wasmGpuClientShxIncomplete += 1;
    }
  }
  return { shxStyleResolvable, shxGpuEligible, wasmGpuClientShxIncomplete };
}

function minimalMirylBytes() {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
  return bytes;
}

function runSyntheticProof(origin, latinFrom3096) {
  clearCadShxFonts();
  registerCadShxFonts([{ name: 'MIRYL.SHX', bytes: minimalMirylBytes() }]);
  registerCadShxStyleTable([
    { name: 'TRHEBTXT', font: 'MIRYL.SHX' },
    { name: 'SYNLATIN', font: 'MIRYL.SHX' },
  ]);

  const inlineRecord = {
    k: 'text',
    t: 'A',
    x: 0,
    y: 0,
    h: 2,
    r: 0,
    c: 0xff000000,
    layer: 0,
    style: 'MIRYL.SHX',
    gpu: true,
  };

  const latinSource =
    latinFrom3096.find((t) => t.t && /^[\x20-\x7E]+$/.test(String(t.t).trim())) ?? null;
  const styleNameProof = {
    k: 'text',
    t: 'A',
    x: 10,
    y: 10,
    h: 2,
    r: 0,
    c: 0xff000000,
    layer: 0,
    style: 'TRHEBTXT',
    gpu: true,
  };

  const proofs = [
    { label: 'inline-miryl-shx', record: inlineRecord },
    { label: 'style-table-trhebtxt', record: styleNameProof },
  ];
  if (latinSource) {
    proofs.push({
      label: '3096-latin-filtered',
      record: {
        ...latinSource,
        t: String(latinSource.t).trim().slice(0, 8) || 'A',
        gpu: true,
      },
    });
  }

  const results = [];
  for (const { label, record } of proofs) {
    const handoff = applyCadP8GpuTextHandoff(new Float32Array(0), {
      texts: [{ ...record }],
      origin,
      segmentStride: 8,
    });
    results.push({
      label,
      style: record.style,
      shxSegmentsAdded: handoff.segments.length,
      shxGpuCount: handoff.scene.texts[0]?.gpu === true ? 1 : 0,
      gpuComplete: isShxTextRecordGpuComplete(handoff.scene.texts[0], origin),
    });
  }

  const directScene = stripUpstreamClientShxGpuFlags({ texts: [{ ...inlineRecord, gpu: true }] });
  const direct = appendShxGpuSegments(new Float32Array(0), directScene, origin);
  return {
    ok: results.some((r) => r.shxSegmentsAdded > 0 && r.shxGpuCount >= 1),
    synthFonts: ['MIRYL.SHX (minimal inline)'],
    proofs: results,
    appendDirect: {
      shxSegmentsAdded: direct.segments.length,
      shxGpuCount: direct.shxGpuCount,
    },
  };
}

let storageFonts = null;
const storageDir = process.env.PF_CAD_STORAGE_DIR?.trim();
if (storageDir && fs.existsSync(storageDir)) {
  clearCadShxFonts();
  const fileIndex = await buildLocalStorageCadIndex(storageDir);
  const fontResolve = await resolveCadFontsFromStorage({
    fonts: json.report?.fonts,
    textStyleTable: json.textStyleTable,
    texts,
    hostPath: host.replace(/\\/g, '/'),
    fileIndex,
    xrefPaths: Object.values(json.report?.xrefs ?? {}),
  });
  registerCadShxFonts(fontResolve.resolved);
  const styleLinked = registerCadShxStyleTable(json.textStyleTable);
  registerCadShxEntityStyleHeuristics(texts, json.textStyleTable);
  const shxResolvable = texts.filter((t) => lookupShxFont(t.style)).length;
  storageFonts = {
    storageDir,
    resolvedShx: fontResolve.resolved.filter((f) => /\.shx$/i.test(f.name)).length,
    missingFonts: fontResolve.missingFonts.length,
    textStyleTableRows: json.textStyleTable?.length ?? 0,
    styleAliasesLinked: styleLinked,
    shxResolvableTextRecords: shxResolvable,
  };
}

let merge = null;
let coverageStats = null;
let styleBinding = null;
let metricsAfterLoad = shxHandoffMetrics(texts, origin);

if (shxNames.length > 0 || storageFonts?.resolvedShx > 0) {
  let styleAliasesLinked = storageFonts?.styleAliasesLinked ?? 0;
  let entityHeuristicsLinked = 0;
  let textStyleAliasesLinked = 0;
  if (shxNames.length > 0 && !storageFonts) {
    styleAliasesLinked = registerCadShxStyleTable(json.textStyleTable);
    entityHeuristicsLinked = registerCadShxEntityStyleHeuristics(texts, json.textStyleTable);
    textStyleAliasesLinked = registerCadShxTextStyleAliases(texts);
  }
  const styleCounts = new Map();
  for (const t of texts) {
    const key = t.style != null ? String(t.style) : '';
    styleCounts.set(key, (styleCounts.get(key) ?? 0) + 1);
  }
  styleBinding = {
    styleAliasesLinked,
    entityHeuristicsLinked,
    textStyleAliasesLinked,
    textStyleTableSample: (json.textStyleTable ?? []).slice(0, 8),
    reportFontKeysSample: Object.keys(json.report?.fonts ?? {}).slice(0, 12),
    topTextStyles: [...styleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([style, count]) => ({
        style,
        count,
        lookupShxFont: !!lookupShxFont(style),
      })),
  };
  metricsAfterLoad = shxHandoffMetrics(texts, origin);
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

  const metricsAfterFonts = shxHandoffMetrics(after, origin);
  merge = {
    shxFilesLoaded: shxNames.length,
    shxFileNames: shxNames.slice(0, 12),
    wasmSegmentFloats: wasmSegments.length,
    mergedSegmentFloats: handoff.segments.length,
    shxSegmentsAdded: handoff.segments.length - wasmSegments.length,
    shxGpuCount: handoff.scene.gpuTexts ?? gpuMarked,
    gpuMarkedAfterMerge: gpuMarked,
    canvasDrawBefore,
    canvasDrawAfter,
    canvasSkippedByGpu: canvasDrawBefore - canvasDrawAfter,
    ...metricsAfterFonts,
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

const syntheticProof = runSyntheticProof(origin, texts);

console.log(
  JSON.stringify(
    {
      host: path.basename(host),
      textTotal: texts.length,
      wasmGpuMarked: texts.filter((t) => t.gpu === true).length,
      opaqueArgbTexts: opaquePacked,
      opaqueNotBrokenCssPaint: brokenCssWouldHide,
      mirrorFlagRecords: mirrorTrue,
      canvasFallbackRecords: canvasFallback,
      textStyleTableRows: json.textStyleTable?.length ?? 0,
      entityTextStyles: collectEntityTextStyleDiagnostics({
        texts,
        textStyleTable: json.textStyleTable,
      }).slice(0, 15),
      storageFonts,
      styleBinding,
      shxHandoff: {
        ...metricsAfterLoad,
        shxSegmentsAdded: merge?.shxSegmentsAdded ?? 0,
      },
      syntheticProof,
      shxMerge: merge,
      glyphCoverage: coverageStats,
    },
    null,
    2,
  ),
);
