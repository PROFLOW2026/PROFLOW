#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const EVIDENCE_DIR = join(ROOT, "docs", "design", "exlfy-design-v2", "evidence");
const PIXELS_DIR = join(EVIDENCE_DIR, "pixels");
const OUT_JSON = join(EVIDENCE_DIR, "p6-pixels.json");
const SPECIMEN_URL = "http://127.0.0.1:3010/he-IL/dev/design-system";
const BASE_HOST = "127.0.0.1";

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];

const BASELINE_RED = "oklch(57.7% 0.245 27.325)";
const BASELINE_WHITE = "#fff";
const LIT_RED = "oklch(57.7% 0.245 27.325)";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function comparePngBuffers(a, b, tolerance = 0) {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      pass: false,
      differingPixels: -1,
      widthA: imgA.width,
      heightA: imgA.height,
      widthB: imgB.width,
      heightB: imgB.height,
      reason: "dimension-mismatch",
    };
  }
  let differingPixels = 0;
  const dataA = imgA.data;
  const dataB = imgB.data;
  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
    const da = Math.abs(dataA[i + 3] - dataB[i + 3]);
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      differingPixels += 1;
    }
  }
  return {
    pass: differingPixels === 0,
    differingPixels,
    width: imgA.width,
    height: imgA.height,
    tolerance,
  };
}

function specimenMarkup({ textClass, bgClass, rootVars }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>P6 static specimen</title>
  <style>
    :root { ${rootVars} }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, sans-serif;
      background: #f4f4f5;
      padding: 24px;
    }
  </style>
</head>
<body>
  <nav style="margin-bottom:16px;">
    <a href="#" class="nav-link" style="text-decoration:none;font-weight:600;">Nav link</a>
  </nav>
  <div class="${bgClass} card" style="padding:20px;border-radius:12px;border:1px solid #e4e4e7;max-width:360px;">
    <p class="${textClass} sample-text" style="margin:0 0 12px;font-size:16px;">Sample destructive label text</p>
    <button type="button" class="${bgClass} ${textClass} sample-btn" style="padding:8px 16px;border-radius:8px;border:1px solid #e4e4e7;cursor:pointer;font-size:14px;">
      Action
    </button>
  </div>
</body>
</html>`;
}

function buildStaticPages() {
  const baselineHtml = specimenMarkup({
    textClass: "text-red-600",
    bgClass: "bg-white",
    rootVars: `--color-red-600: ${BASELINE_RED}; --color-white: ${BASELINE_WHITE};`,
  }).replace(
    "</style>",
    `.text-red-600 { color: var(--color-red-600); }
    .bg-white { background-color: var(--color-white); }
    .nav-link { color: var(--color-red-600); }
    </style>`,
  );

  const litHtml = specimenMarkup({
    textClass: "text-lit-red",
    bgClass: "bg-lit-white",
    rootVars: `--pf-lit-red-600: ${LIT_RED}; --pf-lit-white: ${BASELINE_WHITE};`,
  }).replace(
    "</style>",
    `.text-lit-red { color: var(--pf-lit-red-600); }
    .bg-lit-white { background-color: var(--pf-lit-white); }
    .nav-link { color: var(--pf-lit-red-600); }
    </style>`,
  );

  return { baselineHtml, litHtml };
}

async function captureSpecimenShot(browser, { theme, viewport, outPath }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  try {
    await context.addCookies([
      {
        name: "pf-ui-style",
        value: "classic",
        domain: BASE_HOST,
        path: "/",
        sameSite: "Lax",
      },
      {
        name: "pf-ui-theme",
        value: theme,
        domain: BASE_HOST,
        path: "/",
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(SPECIMEN_URL, { waitUntil: "networkidle", timeout: 120_000 });
    const domStyle = await page.evaluate(() =>
      document.documentElement.getAttribute("data-pf-style"),
    );
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    const needsDark = theme === "dark";
    if (domStyle !== "classic" || hasDark !== needsDark) {
      await page.evaluate(
        ({ needsDark }) => {
          document.documentElement.setAttribute("data-pf-style", "classic");
          document.documentElement.classList.toggle("dark", needsDark);
        },
        { needsDark },
      );
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await context.close();
  }
  const buf = await readFile(outPath);
  return { sha256: sha256(buf), byteSize: buf.length, path: outPath };
}

async function captureFileShot(browser, filePath, outPath) {
  const context = await browser.newContext({
    viewport: { width: 800, height: 480 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(filePath).href, { waitUntil: "load", timeout: 60_000 });
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await context.close();
  }
  const buf = await readFile(outPath);
  return { sha256: sha256(buf), byteSize: buf.length, path: outPath };
}

async function probeSpecimen() {
  try {
    const res = await fetch(SPECIMEN_URL, { redirect: "follow" });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, message: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  await mkdir(PIXELS_DIR, { recursive: true });

  const missing = [];
  try {
    await import("playwright");
  } catch {
    missing.push("playwright");
  }
  try {
    await import("pngjs");
  } catch {
    missing.push("pngjs");
  }

  const probe = await probeSpecimen();
  const result = {
    tool: "classic-pixel-proof",
    capturedAt: new Date().toISOString(),
    specimenUrl: SPECIMEN_URL,
    missingDependencies: missing,
    headClassic: {
      proofKind: "stability",
      description:
        "Two consecutive Playwright runs of HEAD classic specimen (product page); not compared to pre-codemod baseline CSS.",
      runs: [],
      comparisons: [],
      pass: null,
      pixelDifferenceTotal: null,
    },
    staticBaselineEquality: {
      proofKind: "baseline-css-vs-lit-token",
      description:
        "File URL static pages: baseline .text-red-600/.bg-white vars vs --pf-lit-red-600 equivalent colors from lit.css.",
      pass: null,
      pixelDifference: null,
      baselineSha256: null,
      litSha256: null,
      byteHashEqual: null,
    },
    pixelDifferenceIsZero: null,
  };

  if (missing.length > 0 || !probe.ok) {
    result.error = missing.length
      ? `Missing packages: ${missing.join(", ")}`
      : probe.message ?? `Specimen HTTP ${probe.status}`;
    result.pixelDifferenceIsZero = false;
    await writeFile(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const runShots = [[], []];

  try {
    for (let run = 0; run < 2; run += 1) {
      const runId = `run${run + 1}`;
      const shots = [];
      for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
          const fileName = `p6-head-classic-${theme}-${viewport.id}-${runId}.png`;
          const outPath = join(PIXELS_DIR, fileName);
          const meta = await captureSpecimenShot(browser, { theme, viewport, runId, outPath });
          shots.push({
            runId,
            theme,
            viewport: viewport.id,
            fileName,
            ...meta,
          });
        }
      }
      runShots[run] = shots;
      result.headClassic.runs.push({
        runId,
        shots: shots.map(({ fileName, theme, viewport, sha256: hash, byteSize }) => ({
          fileName,
          theme,
          viewport,
          sha256: hash,
          byteSize,
        })),
      });
    }

    const comparisons = [];
    let stabilityDiffTotal = 0;
    for (let i = 0; i < runShots[0].length; i += 1) {
      const a = await readFile(runShots[0][i].path);
      const b = await readFile(runShots[1][i].path);
      const cmp = comparePngBuffers(a, b, 0);
      stabilityDiffTotal += cmp.differingPixels >= 0 ? cmp.differingPixels : 0;
      comparisons.push({
        theme: runShots[0][i].theme,
        viewport: runShots[0][i].viewport,
        run1Sha256: runShots[0][i].sha256,
        run2Sha256: runShots[1][i].sha256,
        sha256Equal: runShots[0][i].sha256 === runShots[1][i].sha256,
        ...cmp,
      });
    }
    result.headClassic.comparisons = comparisons;
    result.headClassic.pixelDifferenceTotal = stabilityDiffTotal;
    result.headClassic.pass = stabilityDiffTotal === 0 && comparisons.every((c) => c.pass);

    const { baselineHtml, litHtml } = buildStaticPages();
    const baselineHtmlPath = join(EVIDENCE_DIR, "p6-static-baseline.html");
    const litHtmlPath = join(EVIDENCE_DIR, "p6-static-lit.html");
    await writeFile(baselineHtmlPath, baselineHtml, "utf8");
    await writeFile(litHtmlPath, litHtml, "utf8");

    const baselinePng = join(PIXELS_DIR, "p6-static-baseline.png");
    const litPng = join(PIXELS_DIR, "p6-static-lit.png");
    const baselineMeta = await captureFileShot(browser, baselineHtmlPath, baselinePng);
    const litMeta = await captureFileShot(browser, litHtmlPath, litPng);

    const baseBuf = await readFile(baselinePng);
    const litBuf = await readFile(litPng);
    const staticCmp = comparePngBuffers(baseBuf, litBuf, 0);

    result.staticBaselineEquality.baselineSha256 = baselineMeta.sha256;
    result.staticBaselineEquality.litSha256 = litMeta.sha256;
    result.staticBaselineEquality.byteHashEqual = baselineMeta.sha256 === litMeta.sha256;
    result.staticBaselineEquality.pixelDifference = staticCmp.differingPixels;
    result.staticBaselineEquality.pass = staticCmp.pass;
    result.staticBaselineEquality.comparison = staticCmp;
    result.staticBaselineEquality.files = {
      baselineHtml: "docs/design/exlfy-design-v2/evidence/p6-static-baseline.html",
      litHtml: "docs/design/exlfy-design-v2/evidence/p6-static-lit.html",
      baselinePng: "docs/design/exlfy-design-v2/evidence/pixels/p6-static-baseline.png",
      litPng: "docs/design/exlfy-design-v2/evidence/pixels/p6-static-lit.png",
    };

    result.pixelDifferenceIsZero =
      result.headClassic.pass === true && result.staticBaselineEquality.pass === true;
  } finally {
    await browser.close();
  }

  await writeFile(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      pixelDifferenceIsZero: result.pixelDifferenceIsZero,
      jsonPath: OUT_JSON,
      headClassicPass: result.headClassic.pass,
      staticPass: result.staticBaselineEquality.pass,
    }),
  );
  process.exitCode = result.pixelDifferenceIsZero ? 0 : 1;
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  const payload = {
    tool: "classic-pixel-proof",
    capturedAt: new Date().toISOString(),
    error: message,
    pixelDifferenceIsZero: false,
  };
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.error(message);
  process.exitCode = 1;
});