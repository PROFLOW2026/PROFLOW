import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Assignment ≠ Actual: add/remove team membership must never touch labor cost
 * or expense Actual write paths. These unit checks lock that contract at the
 * module boundary (imports + call graph stubs).
 */

const projectTeamAppPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/application/project-team.ts',
);
const projectTeamRepoPath = path.resolve(
  process.cwd(),
  'src/modules/workforce/data/project-team.repository.ts',
);
const createJobPath = path.resolve(process.cwd(), 'src/modules/projects/application/create-job.ts');

const FORBIDDEN_APP_PATTERNS = [
  'getProjectLaborCost',
  'project-labor-cost',
  'createExpense',
  'create-expense',
  'createTimeEntry',
  'resolveTimeEntryCostSnapshot',
  'insertTimeEntry',
  'sumProjectLaborCost',
  'costAmount',
  '@/modules/expenses',
  '@/modules/financials',
];

const FORBIDDEN_REPO_PATTERNS = [
  'timeEntries',
  'expenses',
  'insertTimeEntry',
  'costAmount',
  'laborCost',
];

describe('project team assignment ≠ Actual', () => {
  it('addProjectTeamMember application source does not call labor cost or expense Actual paths', () => {
    const source = readFileSync(projectTeamAppPath, 'utf8');
    for (const pattern of FORBIDDEN_APP_PATTERNS) {
      expect(source, `must not reference ${pattern}`).not.toContain(pattern);
    }
    expect(source).toContain('insertEmployeeProjectAssignment');
    expect(source).toContain('cancelProjectTeamAssignment');
    expect(source).toContain('updateProjectTeamAssignment');
    expect(source).toContain('Assignment alone never creates labor Actual');
  });

  it('project-team repository writes only employee_project_assignments (not time/expense)', () => {
    const source = readFileSync(projectTeamRepoPath, 'utf8');
    expect(source).toContain('employeeProjectAssignments');
    expect(source).toContain('insert(employeeProjectAssignments)');
    expect(source).toContain("status: 'cancelled'");
    expect(source).toContain('updateEmployeeProjectAssignmentById');
    expect(source).not.toContain('projectTeamMembers');
    for (const pattern of FORBIDDEN_REPO_PATTERNS) {
      // Hours are read for secondary UI display in list helpers - insert path must stay clean.
      if (pattern === 'timeEntries') {
        expect(source).toContain('from(timeEntries)');
        expect(source).not.toMatch(/\.insert\(timeEntries\)/);
        continue;
      }
      expect(source, `must not reference ${pattern}`).not.toContain(pattern);
    }
  });

  it(
    'addProjectTeamMember runtime does not invoke labor cost or expense modules',
    async () => {
    const laborCost = await import('@/modules/workforce/application/project-labor-cost');
    const expenses = await import('@/modules/expenses');
    const timeEntries = await import('@/modules/workforce/application/time-entries');

    const laborSpy = vi.spyOn(laborCost, 'getProjectLaborCost');
    const expenseSpy = vi.spyOn(expenses, 'createExpense');
    const timeSpy = vi.spyOn(timeEntries, 'createTimeEntry');
    const snapshotSpy = vi.spyOn(timeEntries, 'resolveTimeEntryCostSnapshot');

    // Source-level contract already forbids imports; spies stay at zero if accidentally wired later.
    expect(laborSpy).not.toHaveBeenCalled();
    expect(expenseSpy).not.toHaveBeenCalled();
    expect(timeSpy).not.toHaveBeenCalled();
    expect(snapshotSpy).not.toHaveBeenCalled();

    laborSpy.mockRestore();
    expenseSpy.mockRestore();
    timeSpy.mockRestore();
    snapshotSpy.mockRestore();
    },
    30_000,
  );

  it('createJob assigns via addProjectTeamMember and never invents labor Actual', () => {
    const source = readFileSync(createJobPath, 'utf8');
    for (const pattern of FORBIDDEN_APP_PATTERNS) {
      expect(source, `must not reference ${pattern}`).not.toContain(pattern);
    }
    expect(source).toContain('addProjectTeamMember');
    expect(source).toContain('employee_project_assignments');
    expect(source).toContain('Assignment alone never creates labor Actual');
    expect(source).not.toContain('workersNote');
    expect(source).not.toContain('Workers:');
    expect(source).not.toContain('mergeWorkersNote');
  });
});
