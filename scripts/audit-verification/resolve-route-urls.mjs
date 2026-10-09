/**
 * Resolves docs/audits/_route-inventory-2026-10-09.txt to browser paths with fixtures.
 * Output: docs/audits/_verification-routes-resolved.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LOCALE = 'he-IL';
const PLACEHOLDER = '00000000-0000-4000-8000-000000000001';

const inventoryPath = path.join(ROOT, 'docs/audits/_route-inventory-2026-10-09.txt');
const fixturesPath = path.join(ROOT, 'tests/e2e/.audit-route-fixtures.json');

const inventory = readFileSync(inventoryPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const fixtures = existsSync(fixturesPath)
  ? JSON.parse(readFileSync(fixturesPath, 'utf8'))
  : {};

function personaForLine(line) {
  if (line.includes('/contractor/')) return 'contractor';
  if (line.includes('/employee/')) return 'employee';
  if (line.includes('/(auth)/') || line.includes('/legal/') || line.includes('/onboarding')) {
    return 'public';
  }
  if (line.includes('/portal')) return 'public';
  if (line.includes('/setup')) return 'public';
  return 'owner';
}

function inventoryLineToUrlPath(line, personaFixtures) {
  if (line === '[locale]') return `/${LOCALE}`;

  let rest = line.replace(/^\[locale\]\//, '');
  rest = rest.replace(/\([^)]+\)\//g, '');

  const segments = rest.split('/').filter(Boolean);
  const urlSegments = [LOCALE];

  for (const seg of segments) {
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const key = seg.slice(1, -1);
      const value =
        personaFixtures[key] ??
        fixtures[key] ??
        (key === 'projectId' && personaFixtures.gcProjectId ? personaFixtures.gcProjectId : undefined) ??
        PLACEHOLDER;
      urlSegments.push(value);
    } else {
      urlSegments.push(seg);
    }
  }

  return `/${urlSegments.join('/')}`;
}

const resolved = inventory.map((line) => {
  const persona = personaForLine(line);
  const personaFixtures =
    persona === 'contractor'
      ? { ...fixtures, projectId: fixtures.gcProjectId ?? fixtures.projectId }
      : fixtures;
  const urlPath = inventoryLineToUrlPath(line, personaFixtures);
  return {
    inventoryLine: line,
    persona,
    urlPath,
    usedPlaceholder: urlPath.includes(PLACEHOLDER),
  };
});

const outPath = path.join(ROOT, 'docs/audits/_verification-routes-resolved.json');
writeFileSync(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: resolved.length, routes: resolved }, null, 2)}\n`);

console.log(`Wrote ${resolved.length} routes to ${outPath}`);
