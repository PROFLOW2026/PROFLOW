import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../../..');
const appDir = path.join(root, 'src/app');

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      walk(p, acc);
    } else if (ent.name === 'page.tsx' || ent.name === 'route.ts') {
      acc.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  }
  return acc;
}

const routes = walk(appDir).sort();
const pages = routes.filter((r) => r.endsWith('page.tsx'));
const apiRoutes = routes.filter((r) => r.includes('/api/') && r.endsWith('route.ts'));

const shells = {};
for (const p of pages) {
  const m = p.match(/src\/app\/\[locale\]\/([^/]+)/);
  const shell = m ? m[1] : 'other';
  shells[shell] = (shells[shell] ?? 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  commit: '35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e',
  totals: {
    pageFiles: pages.length,
    routeHandlers: apiRoutes.length,
    allPageOrRouteFiles: routes.length,
  },
  pagesByShell: shells,
  apiRoutes,
  sampleProjectTabs: pages.filter((p) => p.includes('projects/[projectId]/')).slice(0, 80),
  projectTabCount: pages.filter((p) => p.includes('projects/[projectId]/')).length,
};

const outPath = path.join(
  root,
  'docs/audits/2026-10-full-system-audit/MODULE_ROUTE_INVENTORY.json',
);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath, out.totals);
