import fs from "node:fs";
import path from "node:path";

const baselineCssPath = process.argv[2];
const outPath = process.argv[3];
const css = fs.readFileSync(baselineCssPath, "utf8");

function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

function tokens(block) {
  const map = {};
  for (const match of block.matchAll(/(--pf-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    map[match[1]] = match[2].trim();
  }
  return map;
}

const light = tokens(blockAfter(css, ":root"));
const dark = tokens(blockAfter(css, ".dark"));
const payload = {
  sourceCommit: "93e827c4cfb368c9f81b44465bf3cb6720113649",
  capturedAt: new Date().toISOString(),
  note: "Declared Classic tokens from the base commit. Isolated worktree .worktrees/classic-baseline. design/exlfy-v2 was not reset.",
  lightCount: Object.keys(light).length,
  darkCount: Object.keys(dark).length,
  light,
  dark,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ light: payload.lightCount, dark: payload.darkCount, out: outPath }));