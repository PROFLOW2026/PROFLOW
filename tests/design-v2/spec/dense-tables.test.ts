import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const NUMERIC_CLASS_RE = /tabular-nums|pf-numeric/;

const DENSE_NUMERIC_SOURCES = [
  { label: "MoneyText", relPath: "src/components/patterns/money-text.tsx" },
  { label: "BOQ measure UI (numeric cells)", relPath: "src/modules/boq/ui/boq-measure-client.tsx" },
];

function readUtf8(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  expect(fs.existsSync(abs), "missing source file: " + relPath).toBe(true);
  return fs.readFileSync(abs, "utf8");
}

describe("design-v2 dense tables — tabular numeric alignment", () => {
  for (const { label, relPath } of DENSE_NUMERIC_SOURCES) {
    it(label + " (" + relPath + ") keeps pf-numeric or tabular-nums", () => {
      const source = readUtf8(relPath);
      expect(NUMERIC_CLASS_RE.test(source), relPath + " must keep tabular numeric alignment").toBe(true);
    });
  }

  it("attendance monthly grid keeps LTR day numbers and the lit warning color", () => {
    const source = readUtf8("src/modules/workforce/ui/attendance-monthly-grid.tsx");
    expect(source.includes('dir="ltr"'), "day numbers stay dir=ltr").toBe(true);
    expect(source.includes("text-(--pf-lit-red-600)"), "codemod lit color remains").toBe(true);
  });
});
