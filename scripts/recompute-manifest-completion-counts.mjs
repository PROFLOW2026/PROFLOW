/**
 * Sync design patterns + completion from source, then recompute countsByCompletion.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
execSync('node scripts/sync-main-app-manifest-from-source.mjs', { cwd: root, stdio: 'inherit' });

const manifestPath = path.join(root, 'docs/implementation/MAIN_APP_ROUTE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const countsByCompletion = {};
const countsVisual = { verified: 0, notVerified: 0 };
for (const e of manifest.routes) {
  const s = e.completionStatus ?? 'NOT_STARTED';
  countsByCompletion[s] = (countsByCompletion[s] ?? 0) + 1;
  if (e.visualVerified === true) countsVisual.verified++;
  else countsVisual.notVerified++;
}

manifest.countsByCompletion = countsByCompletion;
manifest.countsVisualVerified = countsVisual;
manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
execSync('node scripts/update-main-app-manifest-status.mjs', { cwd: root, stdio: 'inherit' });
console.log('countsByCompletion', countsByCompletion);
console.log('countsVisualVerified', countsVisual);
