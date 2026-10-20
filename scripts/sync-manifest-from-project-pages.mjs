/**
 * Refresh designPatterns + completionStatus for routes by scanning page.tsx
 * and co-located screen.tsx / _project-tasks-page.tsx when page re-exports.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'docs/implementation/MAIN_APP_ROUTE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

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
];

function patternsFromSource(source) {
  const applied = [];
  for (const name of PATTERN_NAMES) {
    if (source.includes(name)) applied.push(name);
  }
  return applied;
}

function readRouteSources(file) {
  const abs = path.join(root, file);
  let combined = '';
  try {
    combined += fs.readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  if (base === 'page.tsx' && combined.includes("from './screen'")) {
    const screenPath = path.join(dir, 'screen.tsx');
    try {
      combined += '\n' + fs.readFileSync(screenPath, 'utf8');
    } catch {
      /* ignore */
    }
  }
  if (base === 'page.tsx' && combined.includes("from './_project-tasks-page'")) {
    const tasksPath = path.join(dir, '_project-tasks-page.tsx');
    try {
      combined += '\n' + fs.readFileSync(tasksPath, 'utf8');
    } catch {
      /* ignore */
    }
  }
  const hubModules = [
    'modules/project-workspace/ui/execution-hub-frame.tsx',
    'modules/project-workspace/ui/execution-hub-links.tsx',
    'modules/project-workspace/ui/contracts-execution-hub.tsx',
  ];
  if (base === 'page.tsx' && hubModules.some((m) => combined.includes(m))) {
    for (const rel of hubModules) {
      try {
        combined += '\n' + fs.readFileSync(path.join(root, 'src', rel), 'utf8');
      } catch {
        /* ignore */
      }
    }
  }
  return patternsFromSource(combined);
}

function completionFromPatterns(patterns) {
  if (patterns.length === 0) return 'NOT_STARTED';
  if (patterns.includes('MainAppPage') && patterns.length >= 2) return 'COMPLETE';
  if (patterns.includes('MainAppPage')) return 'WRAPPER_ONLY';
  return 'PARTIAL';
}

let updated = 0;
for (const entry of manifest.routes) {
  if (entry.domain !== 'projects') continue;
  const patterns = readRouteSources(entry.file);
  const next = completionFromPatterns(patterns);
  if (
    JSON.stringify(entry.designPatterns) !== JSON.stringify(patterns) ||
    entry.completionStatus !== next
  ) {
    entry.designPatterns = patterns;
    entry.uiChangeLevel = patterns.length
      ? patterns.includes('MainAppPage')
        ? 'direct'
        : 'inherited'
      : 'none';
    entry.completionStatus = next;
    updated++;
  }
}

manifest.byDomain = Object.groupBy(manifest.routes, (e) => e.domain);

manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Updated', updated, 'projects manifest entries');
