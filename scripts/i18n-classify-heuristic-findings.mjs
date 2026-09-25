import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const SCAN_ROOTS = ['src/app', 'src/modules'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const JSX_TEXT_RE = />[^<{]*[A-Z][a-z]+/;
const PLACEHOLDER_RE = /placeholder\s*=\s*(?:\{?\s*)?["'][A-Z]/;
const TITLE_RE = /(?:title|label|aria-label|alt)\s*=\s*(?:\{?\s*)?["'][A-Z]/;

function shouldSkipLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return true;
  if (t.startsWith('import ') || t.startsWith('export ')) return true;
  if (UUID_RE.test(line)) return true;
  if (/\bt\s*\(\s*['"]/.test(line)) return true;
  if (/useTranslations|getTranslations|translateClientMessage|formatMessage/.test(line)) return true;
  if (/className=|data-testid=|testId=|href=|src=|type=|key=|ref=|id=|role=|name=|variant=|size=|asChild|onClick=|onChange=|onSubmit=|console\.|throw new/.test(line)) return true;
  if (/["'][a-z][a-zA-Z0-9_-]*\.[a-zA-Z]/.test(line) && !PLACEHOLDER_RE.test(line) && !TITLE_RE.test(line) && !JSX_TEXT_RE.test(line)) return true;
  return false;
}

function isSuspiciousLine(line) {
  if (shouldSkipLine(line)) return false;
  return JSX_TEXT_RE.test(line) || PLACEHOLDER_RE.test(line) || TITLE_RE.test(line);
}

function classify(line, file) {
  if (/\bt\s*\(|useTranslations|getTranslations/.test(line)) return 'false_positive';
  if (/error:\s*['"][A-Z]/.test(line) || /return\s*\{\s*error:\s*['"]/.test(line)) return 'real_ui';
  if (/placeholder\s*=|title\s*=|aria-label\s*=|label\s*=/.test(line)) return 'real_ui';
  const jsx = line.match(/>\s*([^<{]+?)\s*</);
  if (jsx) {
    const text = jsx[1].trim();
    if (/^(ProjectFlow|PDF|CSV|Excel|OCR|MEP|API)$/.test(text)) return 'intentional';
    if (/^[A-Z][a-zA-Z]+$/.test(text) && text.length < 10) return 'false_positive';
    if (/\s/.test(text) && /[a-z]/.test(text)) return 'real_ui';
    if (/^[A-Z][a-z]+(\s+[A-Za-z]+)+/.test(text)) return 'real_ui';
  }
  if (/\.(find|filter|map)\(/.test(line)) return 'false_positive';
  if (/withOrgContext|await\s+\w+\(/.test(line)) return 'false_positive';
  if (/[a-z]+\.[a-zA-Z]/.test(line) && !PLACEHOLDER_RE.test(line)) return 'false_positive';
  if (file.endsWith('.ts') && !file.includes('actions')) return 'false_positive';
  return 'real_ui';
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
}

const findings = [];
for (const root of SCAN_ROOTS) {
  const files = [];
  walk(join(process.cwd(), root), files);
  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isSuspiciousLine(line)) continue;
      findings.push({ file: rel, line: i + 1, category: classify(line, rel), text: line.trim().slice(0, 150) });
    }
  }
}

const summary = { total: findings.length, real_ui: 0, intentional: 0, false_positive: 0 };
for (const f of findings) summary[f.category]++;
writeFileSync('.cursor/i18n-heuristic-classified.json', JSON.stringify({ summary, findings }, null, 2));
console.log(JSON.stringify(summary, null, 2));
