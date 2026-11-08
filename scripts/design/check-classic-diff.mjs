#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
import { loadOwnership, normalizePath, isA1ClassicPath, REPO_ROOT } from "./ownership-lib.mjs";

const BASE_SHA = "93e827c4cfb368c9f81b44465bf3cb6720113649";
const UI_RE = /\.(tsx|ts|css)$/;

const INERT_ATTR_RE =
  /\sdata-pf-(?:slot|style)\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})|\sdata-size\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})/g;

function undoLitTokens(line) {
  return line.replace(
    /\b((?:bg|text|border|ring|outline|decoration|divide|from|via|to)-)\(--pf-lit-([a-z]+(?:-\d+)?)\)(\/\d+)?/g,
    (_, prefix, color, opacity) => prefix + color + (opacity ?? ""),
  );
}

function stripInertAttrs(line) {
  return line.replace(INERT_ATTR_RE, "").replace(/\uFEFF/g, "");
}

function isAttributeOnlyLine(line) {
  const stripped = stripInertAttrs(line).trim();
  return stripped === "" || stripped === ">" || stripped === "/>";
}

function isUiPath(filePath) {
  return UI_RE.test(filePath) && filePath.startsWith("src/");
}

function parseDiff(text) {
  const files = [];
  let current = null;
  for (const raw of text.split(/\n/)) {
    if (raw.startsWith("diff --git ")) {
      const m = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
      current = { path: m ? normalizePath(m[2]) : null, hunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("@@")) {
      current.hunks.push({ header: raw, lines: [] });
      continue;
    }
    if (!current.hunks.length) continue;
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+") || raw.startsWith("-") || raw.startsWith(" ")) {
      current.hunks.at(-1).lines.push(raw);
    }
  }
  return files.filter((f) => f.path && isUiPath(f.path));
}

function hunkIsInertOnly(lines) {
  const removals = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));
  let additions = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
  additions = additions.filter((line) => !isAttributeOnlyLine(line));
  if (removals.length === 0 && additions.length === 0) return true;
  if (removals.length === additions.length) {
  for (let i = 0; i < removals.length; i += 1) {
    if (undoLitTokens(stripInertAttrs(removals[i])) !== undoLitTokens(stripInertAttrs(additions[i]))) return false;
  }
    return true;
  }
  if (removals.length > 0) return false;
  for (const line of additions) {
    const stripped = stripInertAttrs(line);
    if (stripped.trim() !== "" && stripped !== line) return false;
    if (stripped.trim() === "") continue;
    if (/\S/.test(stripped)) return false;
  }
  return additions.length > 0;
}

function main() {
  const ctx = loadOwnership(REPO_ROOT);
  let diffText = "";
  try {
    diffText = execFileSync(
      "git",
      ["diff", BASE_SHA, "--", "src"],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    const stdout = error?.stdout?.toString?.() ?? "";
    const stderr = error?.stderr?.toString?.() ?? "";
    if (stdout) diffText = stdout;
    else {
      console.error(stderr || error.message);
      process.exit(2);
    }
  }

  const files = parseDiff(diffText);
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const file of files) {
    if (isA1ClassicPath(file.path, ctx)) {
      pass += file.hunks.length || 1;
      continue;
    }
    for (const hunk of file.hunks) {
      if (hunkIsInertOnly(hunk.lines)) pass += 1;
      else {
        fail += 1;
        failures.push({ file: file.path, header: hunk.header });
      }
    }
  }

  const ok = fail === 0;
  console.log(
    JSON.stringify(
      {
        tool: "check-classic-diff",
        baseSha: BASE_SHA,
        pass: ok,
        passHunks: pass,
        failHunks: fail,
        uiFiles: files.length,
        failures: failures.slice(0, 40),
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}

main();