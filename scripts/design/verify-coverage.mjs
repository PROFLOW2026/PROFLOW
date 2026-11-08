#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { REPO_ROOT, normalizePath } from "./ownership-lib.mjs";

const ROUTE_FILE_RE = /(^|\/)((page|layout|loading|error|not-found)(\.(tsx|ts|jsx|js))?)$/;

function walkAppRoutes(root) {
  const appDir = path.join(root, "src", "app");
  const matches = [];
  const stack = [appDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = normalizePath(path.relative(appDir, full));
      if (ROUTE_FILE_RE.test(rel)) {
        matches.push(`src/app/${rel}`);
      }
    }
  }
  return matches.sort();
}

function main() {
  const routes = walkAppRoutes(REPO_ROOT);
  const byKind = {};
  for (const file of routes) {
    const base = path.basename(file).replace(/\.(tsx|ts|jsx|js)$/, "");
    byKind[base] = (byKind[base] ?? 0) + 1;
  }
  const report = {
    tool: "verify-coverage",
    pass: routes.length > 0,
    coverageCount: routes.length,
    byKind,
    routes,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main();