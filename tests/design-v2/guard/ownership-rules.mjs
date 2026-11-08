#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  loadOwnership,
  resolveOwner,
  expandBrace,
  withSrcPrefix,
} from "../../../scripts/design/ownership-lib.mjs";

const ctx = loadOwnership(REPO_ROOT);

assert.deepEqual(
  expandBrace("app/[locale]/{live,legal}/**"),
  ["app/[locale]/live/**", "app/[locale]/legal/**"],
);

assert.equal(withSrcPrefix("components/ui/button.tsx"), "src/components/ui/button.tsx");

const specimen = resolveOwner("src/app/[locale]/dev/design-system/page.tsx", ctx);
assert.equal(specimen?.agent, "A1");
assert.equal(specimen?.ruleId, "O-00");

const devOther = resolveOwner("src/app/[locale]/dev/foo/page.tsx", ctx);
assert.equal(devOther?.frozen, true);

const quickCreate = resolveOwner("src/components/shell/quick-create-fab.tsx", ctx);
assert.equal(quickCreate?.frozen, true);

const theme = resolveOwner("src/shared/theme/styles/modern.css", ctx);
assert.equal(theme?.agent, "S1");

const a2tool = resolveOwner("scripts/design/check-ownership.mjs", ctx);
assert.equal(a2tool?.agent, "A2");

const measure = resolveOwner("scripts/design/measure-contrast.mjs", ctx);
assert.equal(measure?.agent, "Q4");

const guardDir = path.dirname(fileURLToPath(import.meta.url));
if (!guardDir.includes("guard")) {
  throw new Error("unexpected guard path");
}

console.log(JSON.stringify({ guard: "ownership-rules", pass: true, root: REPO_ROOT }, null, 2));