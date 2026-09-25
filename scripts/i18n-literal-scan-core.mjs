/**
 * Precise user-visible literal scanner for ProjectFlow i18n verification.
 * Categories: real_ui | intentional | false_positive
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SCAN_ROOTS = ['src/app', 'src/modules'];

const BRAND_ALLOWLIST = new Set([
  'ProjectFlow', 'PDF', 'CSV', 'Excel', 'OCR', 'MEP', 'API', 'URL', 'UUID', 'JSON',
  'RTL', 'LTR', 'ILS', 'VAT', 'HSE', 'RFQ', 'Google', 'Microsoft', 'Dropbox',
  'OneDrive', 'Sumit', 'SUMIT', 'WhatsApp', 'YYYY-MM',
]);

/** Human-readable JSX text between tags (requires space or punctuation — not TS generics). */
const JSX_HUMAN_TEXT_RE =
  />\s*([A-Z][a-z]+(?:[\s,.:;!?'\u2013\u2014-]+[a-zA-Z0-9\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]+)+)\s*</;

const UI_STRING_PROP_RE =
  /(?:placeholder|title|label|aria-label|alt|description|helperText|emptyText|confirmText|cancelText|submitText|heading|message|hint|tooltip|errorMessage)\s*=\s*(?:\{?\s*)?["']([A-Z][^"']*?)["']/;

const SERVER_ERROR_RE = /(?:return\s*\{\s*error:|error:\s*)['"]([A-Za-z][^'"]{2,})['"]/;

const SERVER_SUCCESS_RE = /(?:return\s*\{\s*ok:[^}]*message:\s*)['"]([A-Z][^'"]*)['"]/;

const TOAST_RE = /(?:toast|showToast)\(\s*['"]([A-Z][^'"]*)['"]/;

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
}

function isCommentLine(line) {
  const t = line.trim();
  return !t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.includes('{/*');
}

function isI18nWired(line) {
  return (
    /\bt\s*\(\s*['"`]/.test(line) ||
    /useTranslations|getTranslations|translateClientMessage|formatMessage|localizeCode|localizeCatalogEntryName|localizeClientTypeName|localizePaymentTermName|localizeVendorCategoryName|localizeProfileCatalogName|mapExternalDocError|tErrors\(|tValidation\(/.test(
      line,
    )
  );
}

function isTypeScriptNoise(line) {
  if (/useState<|useMemo<|useRef<|useCallback<|Set<|Map<|Promise<|Array<|Readonly<|Record<|Partial<|FormData|typeof\s|as const|as never|satisfies\s/.test(line)) {
    return true;
  }
  if (/:\s*[A-Z][a-zA-Z]+(\[\])?[;,)]/.test(line) && !UI_STRING_PROP_RE.test(line)) return true;
  if (/import\s|export\s|from\s['"]/.test(line)) return true;
  if (/\.(filter|map|find|reduce|forEach|some|every|includes)\(/.test(line) && !JSX_HUMAN_TEXT_RE.test(line)) return true;
  if (/withOrgContext|await\s+\w+\(/.test(line) && !SERVER_ERROR_RE.test(line)) return true;
  if (/entityType\s*===|Permission\.|PERMISSIONS\.|AUDIT_ACTIONS\./.test(line)) return true;
  if (/className=|variant=|size=|tone=|asChild|onClick=|onChange=|onSubmit=|href=|src=|type=|key=|ref=|id=|role=|name=|data-testid=/.test(line) && !UI_STRING_PROP_RE.test(line) && !JSX_HUMAN_TEXT_RE.test(line)) {
    return true;
  }
  if (/console\.|throw new|logger\.|eslint-disable/.test(line)) return true;
  return false;
}

function classifyText(text, kind, relPath) {
  const t = text.trim();
  if (!t || t.length < 2) return 'false_positive';
  if (BRAND_ALLOWLIST.has(t)) return 'intentional';
  if (/^ProjectFlow\b/.test(t)) return 'intentional';
  if (/^(https?:\/\/|\/[\w/-]+)/.test(t)) return 'false_positive';
  if (/^[a-z][a-zA-Z0-9_]*$/.test(t)) return 'false_positive';
  if (/^[A-Z_]+$/.test(t) && t.length <= 16) return 'false_positive';
  if (/^location_unavailable$|^empty$|^failed$/.test(t)) return 'real_ui';
  if (relPath.includes('/__tests__/') || relPath.includes('.test.')) return 'false_positive';
  if (kind === 'server_error' || kind === 'server_success' || kind === 'toast') return 'real_ui';
  if (kind === 'ui_prop' || kind === 'jsx_text') return 'real_ui';
  return 'false_positive';
}

function extractFindings(line, relPath) {
  const out = [];
  const jsx = line.match(JSX_HUMAN_TEXT_RE);
  if (jsx?.[1]) out.push({ kind: 'jsx_text', text: jsx[1].trim() });
  for (const m of line.matchAll(new RegExp(UI_STRING_PROP_RE.source, 'g'))) {
    out.push({ kind: 'ui_prop', text: m[1] });
  }
  for (const m of line.matchAll(new RegExp(SERVER_ERROR_RE.source, 'g'))) {
    out.push({ kind: 'server_error', text: m[1] });
  }
  for (const m of line.matchAll(new RegExp(SERVER_SUCCESS_RE.source, 'g'))) {
    out.push({ kind: 'server_success', text: m[1] });
  }
  for (const m of line.matchAll(new RegExp(TOAST_RE.source, 'g'))) {
    out.push({ kind: 'toast', text: m[1] });
  }
  return out.map((hit) => ({ ...hit, category: classifyText(hit.text, hit.kind, relPath) }));
}

/** Legacy 987 heuristic (for baseline reporting only). */
export function legacyHeuristicCount() {
  const JSX_TEXT_RE = />[^<{]*[A-Z][a-z]+/;
  const PLACEHOLDER_RE = /placeholder\s*=\s*(?:\{?\s*)?["'][A-Z]/;
  const TITLE_RE = /(?:title|label|aria-label|alt)\s*=\s*(?:\{?\s*)?["'][A-Z]/;
  let count = 0;
  for (const root of SCAN_ROOTS) {
    const files = [];
    walk(join(process.cwd(), root), files);
    for (const file of files) {
      if (!file.endsWith('.tsx')) continue;
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (JSX_TEXT_RE.test(line) || PLACEHOLDER_RE.test(line) || TITLE_RE.test(line)) count += 1;
      }
    }
  }
  return count;
}

export function scanProject() {
  const findings = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(process.cwd(), root);
    if (!existsSync(abs)) continue;
    const files = [];
    walk(abs, files);
    for (const file of files) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isCommentLine(line) || isTypeScriptNoise(line) || isI18nWired(line)) continue;
        for (const hit of extractFindings(line, rel)) {
          findings.push({ file: rel, line: i + 1, ...hit });
        }
      }
    }
  }
  const byCategory = { real_ui: 0, intentional: 0, false_positive: 0 };
  const byFile = new Map();
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    if (f.category === 'real_ui') byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  }
  return {
    heuristicBefore: legacyHeuristicCount(),
    findings,
    summary: {
      total: findings.length,
      ...byCategory,
      realUiRemaining: byCategory.real_ui,
      filesWithRealUi: byFile.size,
      topRealUiFiles: [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    },
  };
}

const isMain = process.argv[1]?.includes('i18n-literal-scan-core');
if (isMain) {
  console.log(JSON.stringify(scanProject().summary, null, 2));
}
