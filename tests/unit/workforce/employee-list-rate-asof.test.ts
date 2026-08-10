import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const employeesRepoPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/data/employees.repository.ts',
);
const employeesAppPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/application/employees.ts',
);
const employeesTablePath = path.resolve(
  process.cwd(),
  'src/modules/workforce/ui/employees-table.tsx',
);

describe('employee list rate as-of date (org timezone)', () => {
  it('listEmployees uses asOfDate parameter instead of Postgres current_date', () => {
    const source = readFileSync(employeesRepoPath, 'utf8');
    expect(source).not.toMatch(/valid_from\s*<=\s*current_date/);
    expect(source).not.toMatch(/valid_to\s*>=\s*current_date/);
    expect(source).toContain('asOfDate');
    expect(source).toContain('${asOfDate}::date');
  });

  it('listEmployeesForOrg passes todayInTimeZone as asOfDate (list/detail agree)', () => {
    const source = readFileSync(employeesAppPath, 'utf8');
    expect(source).toContain('todayInTimeZone(context.organization.timezone)');
    expect(source).toContain('asOfDate');
    expect(source).toContain('canReadWorkforceCost(context)');
  });

  it('canViewWorkforceCosts aligns with canReadWorkforceCost (no empty rate cells)', () => {
    const source = readFileSync(employeesTablePath, 'utf8');
    expect(source).toContain('canReadWorkforceCost(context)');
    expect(source).not.toContain('PROJECT_FINANCIALS_READ');
  });
});
