import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const NUMERIC_CLASS_RE = /tabular-nums|pf-numeric/;

/** Files that must keep tabular numeric alignment after design-v2 codemods. */
const DENSE_NUMERIC_SOURCES: { label: string; relPath: string }[] = [
  { label: "MoneyText", relPath: "src/components/patterns/money-text.tsx" },
  {
    label: "BOQ measure UI (numeric cells)",
    relPath: "src/modules/boq/ui/boq-measure-client.tsx",
  },
  {
    label: "Attendance monthly grid",
    relPath: "src/modules/workforce/ui/attendance-monthly-grid.tsx",
  },
];

function readUtf8(relPath: string): string {
  const abs = path.join(REPO_ROOT, relPath);
  expect(fs.existsSync(abs), `missing source file: ${relPath}`).toBe(true);
  return fs.readFileSync(abs, "utf8");
}

function assertTabularNumericAlignment(relPath: string, source: string): void {
  expect(
    NUMERIC_CLASS_RE.test(source),
    `${relPath} must include tabular-nums or pf-numeric on money/number cells (codemod must not strip dense table alignment)`,
  ).toBe(true);
}

describe("design-v2 dense tables — tabular numeric alignment", () => {
  for (const { label, relPath } of DENSE_NUMERIC_SOURCES) {
    it(`${label} (${relPath}) keeps pf-numeric or tabular-nums`, () => {
      const source = readUtf8(relPath);
      assertTabularNumericAlignment(relPath, source);
    });
  }
});