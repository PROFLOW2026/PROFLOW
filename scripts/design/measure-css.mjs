import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "../..");
const STYLES = path.join(ROOT, "src/shared/theme/styles");

const BUDGETS = [
  {
    id: "modern-bundle",
    files: ["modern.css", "modern-hooks.css"],
    maxGzipBytes: 12 * 1024,
  },
  {
    id: "premium-bundle",
    files: ["premium.css", "premium-hooks.css"],
    maxGzipBytes: 12 * 1024,
  },
  {
    id: "tokens-structure",
    files: ["tokens-structure.css"],
    maxGzipBytes: 8 * 1024,
  },
];

function gzipBytes(filePath) {
  const buf = fs.readFileSync(filePath);
  return { raw: buf.length, gzip: zlib.gzipSync(buf).length };
}

let failed = false;
const rows = [];

for (const budget of BUDGETS) {
  let totalGzip = 0;
  const parts = [];
  for (const name of budget.files) {
    const full = path.join(STYLES, name);
    if (!fs.existsSync(full)) {
      console.error(`missing: ${full}`);
      process.exit(1);
    }
    const sizes = gzipBytes(full);
    parts.push({ name, ...sizes });
    totalGzip += sizes.gzip;
  }
  const pass = totalGzip <= budget.maxGzipBytes;
  if (!pass) failed = true;
  rows.push({
    id: budget.id,
    maxGzipKb: budget.maxGzipBytes / 1024,
    totalGzipBytes: totalGzip,
    totalGzipKb: Math.round((totalGzip / 1024) * 100) / 100,
    pass,
    parts,
  });
}

for (const row of rows) {
  const status = row.pass ? "PASS" : "FAIL";
  console.log(
    `${status} ${row.id}: ${row.totalGzipKb} KiB gzip (budget ${row.maxGzipKb} KiB)`,
  );
  for (const part of row.parts) {
    console.log(`  ${part.name}: raw ${part.raw} B, gzip ${part.gzip} B`);
  }
}

if (failed) {
  console.error("CSS gzip budget exceeded.");
  process.exit(1);
}

console.log("All CSS gzip budgets within limits.");