import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type Decision = {
  unit: { mode: 'full' | 'selected' | 'skip'; paths: string[] };
  migration: boolean;
  ui: boolean;
  integration: string[];
};

function classify(files: string): Decision {
  const output = execFileSync(
    process.execPath,
    ['scripts/ci-unit-scope.mjs', '--print', '--files', files],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as Decision;
}

describe('ci unit scope', () => {
  it('keeps a UI page on the critical set without the full unit project', () => {
    const decision = classify('src/app/[locale]/(app)/today/page.tsx');
    expect(decision.unit.mode).toBe('selected');
    expect(decision.unit.paths).toEqual(expect.arrayContaining([
      'tests/unit/financials',
      'tests/unit/billing',
      'tests/unit/workforce',
      'tests/unit/rbac',
      'tests/unit/database',
      'tests/unit/shared/i18n-messages.test.ts',
    ]));
    expect(decision.ui).toBe(true);
    expect(decision.migration).toBe(false);
  });

  it('adds the billing suites when billing code changes', () => {
    const decision = classify('src/modules/billing/domain/invoice.ts');
    expect(decision.unit.mode).toBe('selected');
    expect(decision.unit.paths).toContain('tests/unit/billing');
    expect(decision.integration).toContain('tests/integration/billing');
    expect(decision.ui).toBe(false);
  });

  it('expands shared permissions, auth, and schema changes to the full unit project', () => {
    expect(classify('src/shared/permissions/catalog.ts').unit.mode).toBe('full');
    expect(classify('src/modules/auth/session.ts').unit.mode).toBe('full');
    expect(classify('src/modules/tenancy/domain/types.ts').unit.mode).toBe('full');
    expect(classify('drizzle/migrations/0199_example.sql').unit.mode).toBe('full');
  });

  it('runs migration hardening for SQL and database setup, not for an unrelated stub', () => {
    expect(classify('drizzle/migrations/0199_example.sql').migration).toBe(true);
    expect(classify('tests/setup/database.ts').migration).toBe(true);
    expect(classify('tests/integration/migration/journal.test.ts').migration).toBe(true);
    expect(classify('vitest.config.ts').migration).toBe(false);
    expect(classify('tests/setup/next-navigation-stub.ts').migration).toBe(false);
    expect(classify('vitest.config.ts').unit.mode).toBe('full');
  });

  it('runs the full unit project when code has no mapped test domain', () => {
    const decision = classify('src/proxy.ts');
    expect(decision.unit.mode).toBe('full');
    expect(decision.unit.paths).toEqual([]);
  });

  it('skips docs and still treats an empty file list as a full run', () => {
    expect(classify('docs/RELEASE-PREFLIGHT.md,.cursor/plans/note.plan.md').unit.mode).toBe('skip');
    expect(classify(' ').unit.mode).toBe('full');
    expect(classify('tests/ui/shell.test.tsx').ui).toBe(true);
  });
});
