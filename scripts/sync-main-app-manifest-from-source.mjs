/**
 * Refresh designPatterns + honest completionStatus from page.tsx and traced UI modules.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'docs/implementation/MAIN_APP_ROUTE_MANIFEST.json');

const PATTERN_NAMES = [
  'MainAppPage',
  'MainAppSection',
  'MainAppTableShell',
  'MainAppListToolbar',
  'MainAppFormGrid',
  'MainAppSummaryGrid',
  'MainAppReportWorkspace',
  'MainAppListPagination',
  'data-pf-ma-page',
  'data-pf-vendors-list-owner',
];

const MAX_FILES = 40;

function patternsFromSource(source) {
  const applied = [];
  for (const name of PATTERN_NAMES) {
    if (source.includes(name)) applied.push(name);
  }
  return applied;
}

const EXT = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

function resolveModulePath(specifier, fromFile) {
  let base;
  if (specifier.startsWith('@/')) {
    base = path.join(root, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXT) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function importSpecifiers(source) {
  const specs = [];
  const re = /\bfrom\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

function shouldFollow(spec) {
  if (spec.startsWith('.')) return true;
  if (!spec.startsWith('@/')) return false;
  if (spec.startsWith('@/modules/')) return true;
  if (spec.startsWith('@/app/[locale]/(app)/')) return true;
  return false;
}

function collectPatterns(entry) {
  const pageAbs = path.join(root, entry.file);
  if (!fs.existsSync(pageAbs)) return [];

  const visited = new Set();
  const queue = [pageAbs];
  const all = new Set();
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_FILES) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    scanned += 1;

    let source = '';
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const p of patternsFromSource(source)) all.add(p);

    if (source.includes('SettingsPageShell')) {
      const shell = path.join(root, 'src/app/[locale]/(app)/settings/settings-shell.tsx');
      if (!visited.has(shell)) queue.push(shell);
    }

    for (const spec of importSpecifiers(source)) {
      if (!shouldFollow(spec)) continue;
      const resolved = resolveModulePath(spec, file);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  if ([...visited].some((f) => {
    try {
      return fs.readFileSync(f, 'utf8').includes('SettingsPageShell');
    } catch {
      return false;
    }
  })) {
    const shell = path.join(root, 'src/app/[locale]/(app)/settings/settings-shell.tsx');
    try {
      for (const p of patternsFromSource(fs.readFileSync(shell, 'utf8'))) all.add(p);
    } catch {
      /* ignore */
    }
  }

  return [...all].sort();
}

function uiChangeLevel(pagePatterns, allPatterns) {
  if (pagePatterns.includes('MainAppPage')) return 'direct';
  if (allPatterns.length) return 'inherited';
  return 'none';
}

function hasMainShell(patterns) {
  return patterns.includes('MainAppPage') || patterns.includes('data-pf-ma-page');
}

function deriveCompletion(archetype, patterns, route, pageSource) {
  if (/redirect\s*\(\{/.test(pageSource) && !hasMainShell(patterns)) {
    return 'NOT_STARTED';
  }
  if (patterns.length === 0) return 'NOT_STARTED';
  const hasPage = hasMainShell(patterns);
  if (!hasPage) return 'NOT_STARTED';
  const content = patterns.filter((p) => p !== 'MainAppPage' && p !== 'data-pf-ma-page');
  if (content.length === 0) return 'WRAPPER_ONLY';

  /** Archetype minimum for STRUCTURE_COMPLETE — not visual or owner sign-off. See MAIN_APP_PROGRESS_TRACKING.md */
  switch (archetype) {
    case 'SETTINGS':
      return patterns.includes('MainAppSection') ? 'PARTIAL' : 'WRAPPER_ONLY';
    case 'LIST':
      if (patterns.includes('MainAppReportWorkspace')) return 'STRUCTURE_COMPLETE';
      if (
        patterns.includes('MainAppTableShell') &&
        (patterns.includes('MainAppListToolbar') ||
          patterns.includes('MainAppListPagination') ||
          patterns.includes('data-pf-vendors-list-owner'))
      ) {
        return 'STRUCTURE_COMPLETE';
      }
      if (patterns.includes('MainAppTableShell') || patterns.includes('MainAppListToolbar')) {
        return 'PARTIAL';
      }
      if (patterns.includes('MainAppSection')) return 'WRAPPER_ONLY';
      return 'PARTIAL';
    case 'FORM':
      return patterns.includes('MainAppFormGrid') ? 'PARTIAL' : 'WRAPPER_ONLY';
    case 'DETAIL':
      return patterns.includes('MainAppSummaryGrid') ||
        (patterns.includes('MainAppSection') && patterns.includes('MainAppTableShell'))
        ? 'PARTIAL'
        : patterns.includes('MainAppSection')
          ? 'WRAPPER_ONLY'
          : 'PARTIAL';
    case 'REPORT':
      return patterns.includes('MainAppReportWorkspace') ? 'STRUCTURE_COMPLETE' : 'PARTIAL';
    case 'BOARD_CALENDAR':
      return patterns.includes('MainAppSection') ? 'PARTIAL' : 'WRAPPER_ONLY';
    case 'WORKSPACE':
      return patterns.includes('MainAppTableShell') ||
        patterns.includes('MainAppSummaryGrid') ||
        patterns.includes('MainAppListToolbar')
        ? 'PARTIAL'
        : patterns.includes('MainAppSection')
          ? 'WRAPPER_ONLY'
          : 'PARTIAL';
    case 'UTILITY':
      return 'PARTIAL';
    default:
      return content.length > 0 ? 'PARTIAL' : 'WRAPPER_ONLY';
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const entry of manifest.routes) {
  const pageAbs = path.join(root, entry.file);
  let pageSource = '';
  try {
    pageSource = fs.readFileSync(pageAbs, 'utf8');
  } catch {
    pageSource = '';
  }
  const pagePatterns = patternsFromSource(pageSource);
  const patterns = collectPatterns(entry);
  entry.designPatterns = patterns;
  entry.uiChangeLevel = uiChangeLevel(pagePatterns, patterns);
  entry.completionStatus = deriveCompletion(entry.archetype, patterns, entry.route, pageSource);
}

manifest.byDomain = Object.groupBy(manifest.routes, (e) => e.domain);

const countsByCompletion = {};
for (const e of manifest.routes) {
  const s = e.completionStatus ?? 'NOT_STARTED';
  countsByCompletion[s] = (countsByCompletion[s] ?? 0) + 1;
}
manifest.countsByCompletion = countsByCompletion;
manifest.updatedAt = new Date().toISOString();

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('synced routes:', manifest.routes.length);
console.log('countsByCompletion', countsByCompletion);
