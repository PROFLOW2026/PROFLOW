import { execFileSync } from "node:child_process";
import fs from "node:fs";

const base = "93e827c4cfb368c9f81b44465bf3cb6720113649";
const required = [
  "src/shared/theme/styles/modern.css",
  "src/shared/theme/styles/premium.css",
  "src/shared/theme/styles/tokens-structure.css",
  "src/shared/theme/styles/lit.css",
  "docs/design/exlfy-design-v2/tokens.v1.json",
  "docs/design/exlfy-design-v2/OWNERSHIP.json",
];
const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
let ancestor = false;
try {
  execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"]);
  ancestor = true;
} catch {
  ancestor = false;
}
const missing = required.filter((file) => !fs.existsSync(file));
const report = {
  tool: "preflight-alignment",
  branch,
  base,
  baseIsAncestor: ancestor,
  missing,
  sqlExecution: false,
  pass: branch === "design/exlfy-v2" && ancestor && missing.length === 0,
};
fs.mkdirSync("docs/design/exlfy-design-v2/evidence", { recursive: true });
fs.writeFileSync("docs/design/exlfy-design-v2/evidence/preflight-alignment.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
process.exit(report.pass ? 0 : 1);
