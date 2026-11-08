#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  REPO_ROOT,
  loadOwnership,
  normalizePath,
  resolveOwner,
} from "./ownership-lib.mjs";

const EVIDENCE_PATH = path.join(
  REPO_ROOT,
  "docs/design/exlfy-design-v2/evidence/codemod-dry-run.json",
);

const PALETTE_COLORS =
  "red|blue|green|amber|slate|gray|zinc|neutral|teal|emerald";
const PALETTE_UTILITIES = "bg|text|border";

const PALETTE_CLASS_RE = new RegExp(
  `\\b((?:${PALETTE_UTILITIES})-)((?:${PALETTE_COLORS})-(\\d{1,3}))\\b`,
  "g",
);

const MONO_UTILITIES =
  "bg|text|border|ring|outline|decoration|divide|from|via|to";
const MONO_CLASS_RE = new RegExp(
  `\\b((?:${MONO_UTILITIES})-)((?:white|black))(?:\\/(\\d{1,3}))?\\b`,
  "g",
);

function walkSrcFiles(root) {
  const srcDir = path.join(root, "src");
  const files = [];
  const stack = [srcDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (/\.(ts|tsx|css)$/.test(name)) files.push(full);
    }
  }
  return files;
}

function isCodemodTarget(relPath, ctx) {
  const owner = resolveOwner(relPath, ctx);
  if (owner?.frozen) return false;
  return true;
}

function classToLitToken(utilityPrefix, colorKey, opacitySuffix = "") {
  return `${utilityPrefix}(--pf-lit-${colorKey})${opacitySuffix}`;
}

function transformSource(text, classToToken, replacementTally) {
  let replacementCount = 0;

  const next = text
    .replace(PALETTE_CLASS_RE, (matched, utilityPrefix, colorKey) => {
      if (matched.includes("--pf-lit-")) return matched;
      const token = classToLitToken(utilityPrefix, colorKey);
      classToToken[matched] = token;
      replacementCount += 1;
      replacementTally[matched] = (replacementTally[matched] ?? 0) + 1;
      return token;
    })
    .replace(MONO_CLASS_RE, (matched, utilityPrefix, colorKey, opacityDigits) => {
      if (matched.includes("--pf-lit-")) return matched;
      const opacitySuffix = opacityDigits ? `/${opacityDigits}` : "";
      const token = classToLitToken(utilityPrefix, colorKey, opacitySuffix);
      classToToken[matched] = token;
      replacementCount += 1;
      replacementTally[matched] = (replacementTally[matched] ?? 0) + 1;
      return token;
    });

  return { text: next, replacementCount, changed: next !== text };
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    dryRun: true,
    paths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      opts.apply = true;
      opts.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      opts.dryRun = true;
      opts.apply = false;
      continue;
    }
    if (arg.startsWith("--")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
    opts.paths.push(normalizePath(arg));
  }
  if (!opts.apply && !argv.includes("--dry-run") && !argv.includes("--apply")) {
    opts.dryRun = true;
  }
  return opts;
}

function resolveTargetFiles(opts, ctx) {
  if (opts.paths.length > 0) {
    return opts.paths
      .map((p) => (path.isAbsolute(p) ? normalizePath(p) : normalizePath(path.join(REPO_ROOT, p))))
      .filter((rel) => rel.startsWith("src/") && /\.(ts|tsx|css)$/.test(rel))
      .filter((rel) => isCodemodTarget(rel, ctx))
      .map((rel) => path.join(REPO_ROOT, rel));
  }
  return walkSrcFiles(REPO_ROOT).filter((full) => {
    const rel = normalizePath(path.relative(REPO_ROOT, full));
    return isCodemodTarget(rel, ctx);
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = loadOwnership(REPO_ROOT);
  const targetFiles = resolveTargetFiles(opts, ctx);
  const classToToken = {};
  const replacementTally = {};
  const files = {};
  let fileCount = 0;
  let replacementCount = 0;

  for (const full of targetFiles) {
    const rel = normalizePath(path.relative(REPO_ROOT, full));
    const original = fs.readFileSync(full, "utf8");
    const { text, replacementCount: fileReplacements, changed } = transformSource(
      original,
      classToToken,
      replacementTally,
    );
    if (!changed) continue;
    fileCount += 1;
    replacementCount += fileReplacements;
    files[rel] = { replacements: fileReplacements };
    if (opts.apply) {
      fs.writeFileSync(full, text, "utf8");
    }
  }

  const sortedClassToToken = Object.fromEntries(
    Object.entries(classToToken).sort(([a], [b]) => a.localeCompare(b)),
  );

  const report = {
    tool: "codemod-leaks",
    mode: opts.dryRun ? "dry-run" : "apply",
    pass: true,
    scannedFiles: targetFiles.length,
    fileCount,
    replacementCount,
    classToToken: sortedClassToToken,
    classReplacementCounts: replacementTally,
    files,
  };

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  process.exit(0);
}

main();
