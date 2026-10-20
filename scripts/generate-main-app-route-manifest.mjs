import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appRoot = path.join(root, 'src/app/[locale]/(app)');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name === 'page.tsx') acc.push(path.relative(root, p).replace(/\\/g, '/'));
  }
  return acc;
}

function routeFromFile(file) {
  const m = file.match(/src\/app\/\[locale\]\/\(app\)\/(.*)\/page\.tsx$/);
  if (!m) return null;
  const seg = m[1];
  if (!seg) return '/';
  return '/' + seg.replace(/\[([^\]]+)\]/g, ':$1');
}

function domainFromRoute(route) {
  const first = route.split('/').filter(Boolean)[0] ?? 'root';
  const map = {
    projects: 'projects',
    workforce: 'workforce',
    financials: 'financial',
    billing: 'financial',
    expenses: 'financial',
    'cash-flow': 'financial',
    'month-close': 'financial',
    overhead: 'financial',
    procurement: 'procurement',
    subcontracts: 'financial',
    reports: 'reports',
    crm: 'crm',
    clients: 'crm',
    quotes: 'crm',
    vendors: 'execution',
    'work-orders': 'execution',
    tasks: 'tasks',
    work: 'tasks',
    workspaces: 'tasks',
    documents: 'documents',
    assets: 'documents',
    'field-ops': 'field',
    safety: 'field',
    compliance: 'field',
    warranty: 'field',
    settings: 'settings',
    meetings: 'operations',
    communications: 'operations',
    forms: 'operations',
    jobs: 'operations',
    portfolio: 'operations',
    approvals: 'operations',
    integrations: 'settings',
    assistant: 'utility',
    today: 'utility',
    notifications: 'utility',
  };
  return map[first] ?? 'other';
}

function guessArchetype(route, file) {
  if (route.endsWith('/new') || route.includes('/edit')) return 'FORM';
  if (route.includes('/print')) return 'UTILITY';
  if (route.includes('settings')) return 'SETTINGS';
  if (route.includes('reports')) return 'REPORT';
  if (file.includes('screen.tsx') || route.includes('/projects/:projectId/')) return 'WORKSPACE';
  if (/\/:[^/]+$/.test(route) && !route.endsWith('/new') && !route.includes('/edit')) return 'DETAIL';
  if (route.includes('boards/') || route.includes('/calendar') || route.includes('/timeline'))
    return 'BOARD_CALENDAR';
  return 'LIST';
}

function patternsFromPageSource(source) {
  const applied = [];
  if (source.includes('MainAppPage')) applied.push('MainAppPage');
  if (source.includes('MainAppSection')) applied.push('MainAppSection');
  if (source.includes('MainAppTableShell')) applied.push('MainAppTableShell');
  if (source.includes('MainAppListToolbar')) applied.push('MainAppListToolbar');
  if (source.includes('MainAppFormGrid')) applied.push('MainAppFormGrid');
  if (source.includes('MainAppSummaryGrid')) applied.push('MainAppSummaryGrid');
  if (source.includes('MainAppReportWorkspace')) applied.push('MainAppReportWorkspace');
  if (source.includes('MainAppListPagination')) applied.push('MainAppListPagination');
  if (source.includes('data-pf-ma-page')) applied.push('data-pf-ma-page');
  return applied;
}

function completionFromPatterns(patterns, _archetype) {
  if (patterns.length === 0) return 'NOT_STARTED';
  if (patterns.includes('MainAppPage') && patterns.length >= 2) return 'PARTIAL';
  if (patterns.includes('MainAppPage')) return 'WRAPPER_ONLY';
  return 'PARTIAL';
}

const files = walk(appRoot).sort();
const entries = files.map((file) => {
  const route = routeFromFile(file);
  const abs = path.join(root, file);
  let source = '';
  try {
    source = fs.readFileSync(abs, 'utf8');
  } catch {
    source = '';
  }
  const patterns = patternsFromPageSource(source);
  const archetype = guessArchetype(route ?? '', file);
  return {
    route,
    file,
    domain: domainFromRoute(route ?? ''),
    archetype,
    designPatterns: patterns,
    uiChangeLevel: patterns.length ? (patterns.includes('MainAppPage') ? 'direct' : 'inherited') : 'none',
    completionStatus: completionFromPatterns(patterns, archetype),
    visualVerified: false,
    knownLimitations: '',
    status: 'NOT_REVIEWED',
  };
});

const countsByCompletion = {};
const countsByArchetype = {};
for (const e of entries) {
  countsByCompletion[e.completionStatus] = (countsByCompletion[e.completionStatus] ?? 0) + 1;
  countsByArchetype[e.archetype] = (countsByArchetype[e.archetype] ?? 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  head: process.env.GIT_HEAD ?? 'local',
  total: entries.length,
  byDomain: Object.groupBy(entries, (e) => e.domain),
  countsByArchetype,
  countsByCompletion,
  countsByStatus: { NOT_REVIEWED: entries.length },
  routes: entries,
};

const outPath = path.join(root, 'docs/implementation/MAIN_APP_ROUTE_MANIFEST.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath, 'routes:', entries.length);
