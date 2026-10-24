/**
 * Chooses which automated tests a change needs.
 *
 * Push CI runs the critical money, payroll, permission, database, and i18n
 * suites plus tests for the modules that changed. Shared infrastructure, auth,
 * tenancy, schema, and this selector expand to the full unit project.
 * The nightly workflow and a manual full_unit dispatch run the complete suites.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CRITICAL_UNIT_PATHS = [
  'tests/unit/financials',
  'tests/unit/billing',
  'tests/unit/billing-plan',
  'tests/unit/expenses',
  'tests/unit/ap',
  'tests/unit/invoicing-integration',
  'tests/unit/month-close',
  'tests/unit/ops-finance',
  'tests/unit/payment-instruments',
  'tests/unit/tax',
  'tests/unit/workforce',
  'tests/unit/employee-app',
  'tests/unit/tenancy',
  'tests/unit/rbac',
  'tests/unit/auth',
  'tests/unit/database',
  'tests/unit/i18n',
  'tests/unit/shared/i18n-messages.test.ts',
];

const FULL_UNIT_PREFIXES = [
  'src/shared/',
  'src/modules/auth/',
  'src/modules/tenancy/',
  'tests/setup/',
  'drizzle/',
];

const FULL_UNIT_FILES = new Set([
  'vitest.config.ts',
  'package.json',
  'package-lock.json',
  'scripts/ci-unit-scope.mjs',
]);

const MIGRATION_SETUP_FILES = new Set([
  'tests/setup/database.ts',
  'tests/setup/pglite-lifecycle.ts',
  'tests/setup/pending-journal-migrations.ts',
]);

export function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '').trim();
}

function isNonCode(filePath) {
  return (
    filePath.startsWith('docs/') ||
    filePath.startsWith('.cursor/') ||
    filePath === '.cursorignore' ||
    filePath.endsWith('.md')
  );
}

function expandsToFullUnit(filePath) {
  if (FULL_UNIT_FILES.has(filePath)) return true;
  if (filePath.startsWith('tsconfig')) return true;
  if (filePath.startsWith('next.config.')) return true;
  if (filePath.startsWith('.github/workflows/')) return true;
  return FULL_UNIT_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function moduleName(filePath) {
  const match = filePath.match(/^src\/modules\/([^/]+)\//);
  return match?.[1] ?? null;
}

function isCodeOrConfig(filePath) {
  if (isNonCode(filePath)) return false;
  if (filePath.startsWith('src/') || filePath.startsWith('scripts/') || filePath.startsWith('tests/')) {
    return true;
  }
  if (filePath.startsWith('.github/')) return true;
  return /(?:^|\/)(?:[^/]*config[^/]*\.(?:js|mjs|cjs|ts)|tsconfig[^/]*|package(?:-lock)?\.json)$/.test(filePath);
}

function hasConfidentTestDomain(filePath) {
  const moduleKey = moduleName(filePath);
  if (moduleKey && existsSync(`tests/unit/${moduleKey}`)) return true;
  if (filePath.startsWith('tests/unit/') && /\.test\.tsx?$/.test(filePath)) return true;
  if (filePath.startsWith('tests/ui/') || filePath.endsWith('.tsx')) return true;
  if (filePath.startsWith('src/locales/')) return true;
  if (filePath.startsWith('tests/integration/migration/')) return true;
  const integration = filePath.match(/^tests\/integration\/([^/]+)\//);
  return Boolean(
    integration?.[1]
    && integration[1] !== 'migration'
    && existsSync(`tests/integration/${integration[1]}`),
  );
}

export function selectUnitScope(changedPaths) {
  const files = [...new Set(changedPaths.map(normalizePath).filter(Boolean))];
  if (files.length === 0) {
    return { mode: 'full', paths: [], reason: 'no changed files' };
  }
  if (files.every(isNonCode)) {
    return { mode: 'skip', paths: [], reason: 'non-code' };
  }
  if (files.some(expandsToFullUnit)) {
    return { mode: 'full', paths: [], reason: 'critical surface' };
  }
  if (files.some((file) => isCodeOrConfig(file) && !hasConfidentTestDomain(file))) {
    return { mode: 'full', paths: [], reason: 'unmapped code or config' };
  }

  const selected = new Set(CRITICAL_UNIT_PATHS.filter((entry) => existsSync(entry)));
  for (const file of files) {
    const moduleKey = moduleName(file);
    if (moduleKey) {
      const unitDir = `tests/unit/${moduleKey}`;
      if (existsSync(unitDir)) selected.add(unitDir);
    }
    if (file.startsWith('tests/unit/') && /\.test\.tsx?$/.test(file)) {
      selected.add(file);
    }
    if (file.startsWith('src/locales/')) {
      if (existsSync('tests/unit/i18n')) selected.add('tests/unit/i18n');
      if (existsSync('tests/unit/ux')) selected.add('tests/unit/ux');
    }
  }

  if (selected.size === 0) {
    return { mode: 'full', paths: [], reason: 'empty selection' };
  }
  return {
    mode: 'selected',
    paths: [...selected].sort(),
    reason: 'affected plus critical',
  };
}

export function selectIntegrationPaths(changedPaths) {
  const files = changedPaths.map(normalizePath).filter(Boolean);
  const selected = new Set();
  for (const file of files) {
    const moduleKey = moduleName(file);
    if (moduleKey) {
      const integrationDir = `tests/integration/${moduleKey}`;
      if (existsSync(integrationDir)) selected.add(integrationDir);
    }
    const direct = file.match(/^tests\/integration\/([^/]+)\//);
    if (direct && direct[1] !== 'migration') {
      const integrationDir = `tests/integration/${direct[1]}`;
      if (existsSync(integrationDir)) selected.add(integrationDir);
    }
  }
  return [...selected].sort();
}

export function wantsUi(changedPaths) {
  return changedPaths.some((filePath) => {
    const normalized = normalizePath(filePath);
    return normalized.startsWith('tests/ui/') || normalized.endsWith('.tsx');
  });
}

export function wantsMigration(changedPaths) {
  return changedPaths.some((filePath) => {
    const normalized = normalizePath(filePath);
    return (
      normalized.startsWith('drizzle/') ||
      normalized.startsWith('drizzle.config.') ||
      normalized.startsWith('tests/integration/migration/') ||
      MIGRATION_SETUP_FILES.has(normalized)
    );
  });
}

export function classifyChange(changedPaths) {
  const unit = selectUnitScope(changedPaths);
  const integration = selectIntegrationPaths(changedPaths);
  return {
    unit,
    migration: wantsMigration(changedPaths),
    ui: wantsUi(changedPaths),
    integration,
  };
}

function readGitLines(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function changedFilesFromGit(local) {
  if (local) {
    const tracked = readGitLines(['diff', '--name-only', 'HEAD']) ?? [];
    const staged = readGitLines(['diff', '--name-only', '--cached']) ?? [];
    const untracked = readGitLines(['ls-files', '--others', '--exclude-standard']) ?? [];
    return [...tracked, ...staged, ...untracked];
  }

  const base = process.env.CI_DIFF_BASE ?? '';
  if (/^[0-9a-f]{40}$/i.test(base) && !/^0+$/.test(base)) {
    const diff = readGitLines(['diff', '--name-only', base, 'HEAD']);
    if (diff) return diff;
  }

  const parent = readGitLines(['diff', '--name-only', 'HEAD~1', 'HEAD']);
  if (parent) return parent;
  return null;
}

function extraImportedUnitTests(moduleNames) {
  const found = new Set();
  for (const moduleKey of moduleNames) {
    const lines = readGitLines(['grep', '-l', `@/modules/${moduleKey}`, '--', 'tests/unit']);
    if (!lines) continue;
    for (const line of lines) {
      if (line.endsWith('.test.ts') || line.endsWith('.test.tsx')) found.add(normalizePath(line));
    }
  }
  return found;
}

function runVitest(args) {
  const cli = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
  execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
}

function emitGithubOutput(decision) {
  const lines = [
    `unit_mode=${decision.unit.mode}`,
    `migration=${decision.migration ? 'true' : 'false'}`,
    `ui=${decision.ui ? 'true' : 'false'}`,
    `integration=${decision.integration.length > 0 ? 'true' : 'false'}`,
  ];
  const payload = `${lines.join('\n')}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, payload);
  else process.stdout.write(payload);
}

function main() {
  const args = process.argv.slice(2);
  const filesFlag = args.indexOf('--files');
  const local = args.includes('--local');
  const projectFlag = args.indexOf('--project');
  const project = projectFlag >= 0 ? args[projectFlag + 1] : 'unit';
  const changed = filesFlag >= 0
    ? args[filesFlag + 1].split(',').map(normalizePath)
    : changedFilesFromGit(local);

  if (changed === null) {
    const forced = classifyChange(['vitest.config.ts']);
    if (args.includes('--github-output')) {
      emitGithubOutput(forced);
      return;
    }
    if (args.includes('--print')) {
      process.stdout.write(`${JSON.stringify(forced)}\n`);
      return;
    }
  }

  const files = changed ?? ['vitest.config.ts'];
  const decision = classifyChange(files);
  if (decision.unit.mode === 'selected') {
    const modules = new Set(files.map(moduleName).filter(Boolean));
    const covered = (file) => decision.unit.paths.some((entry) => (
      file === entry || file.startsWith(`${entry}/`)
    ));
    for (const file of extraImportedUnitTests(modules)) {
      if (!covered(file)) decision.unit.paths.push(file);
    }
    decision.unit.paths = [...new Set(decision.unit.paths)].sort();
  }

  if (args.includes('--print')) {
    process.stdout.write(`${JSON.stringify(decision)}\n`);
    return;
  }
  if (args.includes('--github-output')) {
    emitGithubOutput(decision);
    return;
  }
  if (!args.includes('--run')) {
    emitGithubOutput(decision);
    return;
  }

  if (project === 'unit') {
    if (decision.unit.mode === 'skip') {
      process.stdout.write('Unit tests skipped for non-code changes.\n');
      return;
    }
    if (decision.unit.mode === 'full') runVitest(['run', '--project', 'unit']);
    else runVitest(['run', '--project', 'unit', ...decision.unit.paths]);
    return;
  }

  if (project === 'integration') {
    if (decision.integration.length === 0) {
      process.stdout.write('No integration tests for this change.\n');
      return;
    }
    runVitest(['run', '--project', 'integration', ...decision.integration]);
    return;
  }

  if (project === 'ui') {
    if (!decision.ui) {
      process.stdout.write('No UI tests for this change.\n');
      return;
    }
    runVitest(['run', '--project', 'ui']);
    return;
  }

  if (project === 'migration') {
    if (!decision.migration) {
      process.stdout.write('No migration tests for this change.\n');
      return;
    }
    runVitest(['run', '--project', 'migration', '--maxWorkers=1', '--no-file-parallelism']);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
