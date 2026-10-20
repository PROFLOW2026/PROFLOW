import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'docs/implementation/MAIN_APP_ROUTE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const changed = new Set(
  execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean),
);

function fileTouchesRoute(file, route) {
  if (!route) return false;
  const seg = route === '/' ? '' : route.slice(1);
  const pattern = seg.replace(/:([^/]+)/g, '[$1]');
  return file.includes(`/(app)/${pattern}/page.tsx`) || file.includes(`/(app)/${pattern}.tsx`);
}

const moduleChanged = [...changed].filter((f) => f.startsWith('src/modules/') || f.includes('components/patterns/main-app'));

for (const entry of manifest.routes) {
  const pageFile = entry.file;
  const pageChanged = changed.has(pageFile);
  const related = [...changed].some(
    (f) => f === pageFile || (f.includes('modules/') && fileTouchesRoute(f, entry.route)),
  );
  entry.codeTouched = pageChanged || related;
  if (pageChanged || related) {
    entry.status = 'CHANGED';
  }

  if (entry.ownerApproved === true) {
    entry.implementationPipeline = 'OWNER_APPROVED';
  } else if (entry.visualVerified === true) {
    entry.implementationPipeline = 'VISUALLY_VERIFIED';
  } else if (entry.codeReviewed === true) {
    entry.implementationPipeline = 'CODE_REVIEWED';
  } else if (entry.codeTouched) {
    entry.implementationPipeline = 'CODE_TOUCHED';
  } else {
    entry.implementationPipeline = 'NOT_STARTED';
  }
}

const counts = {};
for (const e of manifest.routes) {
  counts[e.status] = (counts[e.status] ?? 0) + 1;
}
manifest.countsByStatus = counts;
manifest.updatedAt = new Date().toISOString();
manifest.moduleFilesChanged = moduleChanged.length;
manifest.pageFilesChanged = manifest.routes.filter((r) => changed.has(r.file)).length;
manifest.codeTouchedRoutes = manifest.routes.filter((r) => r.codeTouched).length;
manifest.countsByPipeline = {};
for (const e of manifest.routes) {
  const p = e.implementationPipeline ?? 'NOT_STARTED';
  manifest.countsByPipeline[p] = (manifest.countsByPipeline[p] ?? 0) + 1;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(counts, null, 2));
console.log('page files changed:', manifest.pageFilesChanged);
