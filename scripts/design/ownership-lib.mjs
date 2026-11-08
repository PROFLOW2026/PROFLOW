import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(LIB_DIR, "..", "..");

export function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function expandBrace(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const full = match[0];
  const inner = match[1];
  const index = match.index ?? 0;
  const prefix = pattern.slice(0, index);
  const rest = pattern.slice(index + full.length);
  return inner.split(",").flatMap((part) => expandBrace(prefix + part.trim() + rest));
}

function globToRegex(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
      continue;
    }
    if (ch === "*") {
      out += "[^/]*";
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      continue;
    }
    if ("\\.+^${}|".includes(ch) || ch === "(" || ch === ")" || ch === "[" || ch === "]") {
      out += "\\" + ch;
      continue;
    }
    out += ch;
  }
  out += "$";
  return new RegExp(out);
}

export function withSrcPrefix(pattern) {
  const p = normalizePath(pattern);
  if (
    p.startsWith("src/") ||
    p.startsWith("tests/") ||
    p.startsWith("scripts/") ||
    p.startsWith("docs/") ||
    p.startsWith(".cursor/") ||
    p.startsWith(".github/") ||
    p === "vercel.json" ||
    p.startsWith("drizzle/")
  ) {
    return p;
  }
  if (p.startsWith("**/")) {
    return `src/${p}`;
  }
  if (
    p.startsWith("app/") ||
    p.startsWith("components/") ||
    p.startsWith("shared/") ||
    p.startsWith("modules/") ||
    p.startsWith("locales/")
  ) {
    return `src/${p}`;
  }
  if (p.startsWith("vendors/") || p.startsWith("reports/")) {
    return `src/app/[locale]/(app)/${p}`;
  }
  return p;
}

function expandPatterns(patterns) {
  return patterns.flatMap((pattern) => expandBrace(withSrcPrefix(pattern)).map(globToRegex));
}

export function loadOwnership(root = REPO_ROOT) {
  const ownershipPath = path.join(root, "docs/design/exlfy-design-v2/OWNERSHIP.json");
  const allowlistPath = path.join(root, "docs/design/exlfy-design-v2/allowlist.json");
  const doc = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const rules = doc.rules.map((rule) => ({
    ...rule,
    regexes: expandPatterns(rule.patterns),
  }));
  const allowlistRegexes = (allowlist.frozen ?? []).flatMap((entry) =>
    expandPatterns(entry.patterns).map((re) => ({ ...entry, re }))
  );
  return { doc, rules, allowlist, allowlistRegexes };
}

export function resolveOwner(filePath, ctx) {
  const p = normalizePath(filePath);
  for (const entry of ctx.allowlistRegexes) {
    if (entry.re.test(p)) {
      return { ruleId: `allowlist:${entry.id}`, agent: "frozen", frozen: true };
    }
  }
  for (const rule of ctx.rules) {
    if (rule.regexes.some((re) => re.test(p))) {
      return { ruleId: rule.id, agent: rule.agent, frozen: Boolean(rule.frozen) };
    }
  }
  return null;
}

export function isA1ClassicPath(filePath, ctx) {
  const p = normalizePath(filePath);
  const allowed = new Set(ctx.doc.a1ClassicRuleIds ?? ["O-00", "O-04"]);
  for (const rule of ctx.rules) {
    if (!allowed.has(rule.id)) continue;
    if (rule.regexes.some((re) => re.test(p))) return true;
  }
  return false;
}


export function isDesignV2UiFile(relPath) {
  const p = normalizePath(relPath);
  if (!p.startsWith("src/")) return false;
  if (!/\.(ts|tsx|css)$/.test(p)) return false;
  if (p === "src/proxy.ts") return false;
  if (/\.(tsx|css)$/.test(p)) return true;
  if (p.startsWith("src/app/")) return true;
  if (p.startsWith("src/components/")) return true;
  if (p.includes("/ui/")) return true;
  if (p.startsWith("src/shared/ui/") || p.startsWith("src/shared/theme/")) return true;
  return false;
}

export function walkDesignV2UiFiles(root = REPO_ROOT) {
  return walkSrcUiFiles(root).filter(isDesignV2UiFile);
}
export function walkSrcUiFiles(root = REPO_ROOT) {
  const srcDir = path.join(root, "src");
  const out = [];
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
      if (/\.(ts|tsx|css)$/.test(name)) {
        out.push(normalizePath(path.relative(root, full)));
      }
    }
  }
  return out.sort();
}