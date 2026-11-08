#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { REPO_ROOT, normalizePath } from "./ownership-lib.mjs";

const LEAK_RE =
  /\b(?:bg|text|border)-(?:red|blue|green|amber|slate|gray|zinc|neutral|teal|emerald)-\d{1,3}\b/g;

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

function main() {
  const byFile = {};
  let total = 0;
  for (const full of walkSrcFiles(REPO_ROOT)) {
    const text = fs.readFileSync(full, "utf8");
    const matches = text.match(LEAK_RE);
    if (!matches?.length) continue;
    const rel = normalizePath(path.relative(REPO_ROOT, full));
    byFile[rel] = { count: matches.length, samples: [...new Set(matches)].slice(0, 12) };
    total += matches.length;
  }
  const report = {
    tool: "scan-token-leaks",
    pass: true,
    totalMatches: total,
    filesWithLeaks: Object.keys(byFile).length,
    files: byFile,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main();