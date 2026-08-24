import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workDateYearMonthPrefixPattern } from '@/modules/workforce/data/time-entries.repository';

const repoPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/data/time-entries.repository.ts',
);
const indexPath = path.resolve(process.cwd(), 'src/modules/workforce/index.ts');

describe('workDateYearMonthPrefixPattern', () => {
  it('matches work_date YYYY-MM-DD via YYYY-MM prefix', () => {
    expect(workDateYearMonthPrefixPattern('2026-03')).toBe('2026-03-%');
    expect('2026-03-15'.startsWith('2026-03-')).toBe(true);
    expect('2026-04-01'.startsWith('2026-03-')).toBe(false);
  });
});

describe('non-project labor conservation repository contract', () => {
  it('sums residual non-project time with the same displacement helper as project labor', () => {
    const source = readFileSync(repoPath, 'utf8');

    expect(source).toContain('export async function sumOrganizationNonProjectLaborCost');
    expect(source).toContain('export async function sumNonProjectLaborCostByMonth');
    expect(source).toContain("eq(timeEntries.kind, 'non_project')");
    expect(source).toContain("eq(timeEntries.status, 'recorded')");
    expect(source).toContain("eq(timeEntries.approvalStatus, 'approved')");
    expect(source).toContain('isNull(timeEntries.archivedAt)');
    expect(source).toContain('notDisplacedByMonthlyAllocation');
    expect(source).toContain('effectiveLaborCostAmountExpr');
    expect(source).toContain('workDateYearMonthPrefixPattern(options.yearMonth)');
    expect(source).toContain("to_char(${timeEntries.workDate}::date, 'YYYY-MM')");

    const projectLaborBlock = source.slice(
      source.indexOf('export async function sumProjectLaborCost'),
      source.indexOf('export async function sumOrganizationProjectLaborCoverage'),
    );
    expect(projectLaborBlock).toContain("eq(timeEntries.kind, 'project')");
    expect(projectLaborBlock).not.toContain("eq(timeEntries.kind, 'non_project')");
  });

  it('exports conservation loaders from the workforce public API', () => {
    const source = readFileSync(indexPath, 'utf8');
    expect(source).toContain('sumOrganizationNonProjectLaborCost');
    expect(source).toContain('sumNonProjectLaborCostByMonth');
  });
});
