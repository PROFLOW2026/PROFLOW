import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("design-v2 ownership guard", () => {
  it("resolves first-match rules via ownership-rules.mjs", () => {
    const out = execFileSync("node", ["tests/design-v2/guard/ownership-rules.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const parsed = JSON.parse(out) as { pass: boolean };
    expect(parsed.pass).toBe(true);
  });

  it("maps sample A2 paths for check-ownership --agent", () => {
    const out = execFileSync(
      "node",
      [
        "scripts/design/check-ownership.mjs",
        "--agent",
        "A2",
        "scripts/design/check-ownership.mjs",
        "docs/design/exlfy-design-v2/OWNERSHIP.json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const parsed = JSON.parse(out) as { pass: boolean; allowed: number };
    expect(parsed.pass).toBe(true);
    expect(parsed.allowed).toBe(2);
  });
});