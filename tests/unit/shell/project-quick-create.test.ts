import { describe, expect, it } from 'vitest';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team/domain/capabilities';
import { buildEmployeeOrgQuickCreateActions } from '@/components/shell/employee-quick-create-actions';
import {
  buildProjectQuickCreateActions,
  projectIdFromPathname,
} from '@/components/shell/quick-create-project';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('project quick create', () => {
  it('hides menu items when the viewer lacks the capability', () => {
    expect(buildProjectQuickCreateActions(PROJECT_ID, new Set([C.PROJECT_VIEW]))).toEqual([]);

    const operational = buildProjectQuickCreateActions(
      PROJECT_ID,
      new Set([C.CONTRACTOR_VIEW, C.TASKS_VIEW, C.CLAIM_VIEW, C.PROJECT_VIEW]),
    );
    expect(operational.map((action) => action.key)).not.toContain('contractorContract');
    expect(operational.map((action) => action.key)).not.toContain('projectTask');
    expect(operational.map((action) => action.key)).not.toContain('claim');
    expect(operational.map((action) => action.key)).not.toContain('inspection');

    expect(buildProjectQuickCreateActions(PROJECT_ID, new Set([C.RFI_MANAGE])).map((action) => action.key)).toEqual([
      'rfi',
    ]);
  });

  it('prefills the current project id on every visible create link', () => {
    const actions = buildProjectQuickCreateActions(
      PROJECT_ID,
      new Set([
        C.CONTRACT_MANAGE,
        C.TASKS_MANAGE,
        C.SCHEDULE_MANAGE,
        C.RFI_MANAGE,
        C.SUBMITTAL_MANAGE,
        C.DEFECTS_MANAGE,
        C.QUALITY_MANAGE,
        C.CONTRACTOR_COORDINATE,
        C.CLAIM_REVIEW,
      ]),
    );

    expect(actions.map((action) => action.key)).toEqual([
      'contractorContract',
      'projectTask',
      'coordinationEvent',
      'rfi',
      'submittal',
      'defect',
      'inspection',
      'siteInstruction',
      'claim',
    ]);
    for (const action of actions) {
      expect(action.href).toContain(`/projects/${PROJECT_ID}/`);
    }
    expect(actions.find((action) => action.key === 'contractorContract')?.href).toBe(
      `/projects/${PROJECT_ID}/contractors?new=1`,
    );
    expect(actions.find((action) => action.key === 'projectTask')?.href).toBe(
      `/projects/${PROJECT_ID}/tasks?new=1`,
    );
    expect(actions.find((action) => action.key === 'claim')?.href).toBe(`/projects/${PROJECT_ID}/claims?new=1`);
    expect(projectIdFromPathname(`/he-IL/projects/${PROJECT_ID}/rfi`)).toBe(PROJECT_ID);
    expect(projectIdFromPathname(`/he-IL/employee/projects/${PROJECT_ID}/claims`)).toBe(PROJECT_ID);
    expect(projectIdFromPathname('/projects/new')).toBeNull();
  });

  it('prefixes employee project links and ignores any other root', () => {
    const held = new Set([C.CLAIM_REVIEW, C.TASKS_MANAGE]);
    const employee = buildProjectQuickCreateActions(PROJECT_ID, held, `/employee/projects/${PROJECT_ID}`);
    expect(employee.map((action) => action.href)).toEqual([
      `/employee/projects/${PROJECT_ID}/tasks?new=1`,
      `/employee/projects/${PROJECT_ID}/claims?new=1`,
    ]);
    const rejected = buildProjectQuickCreateActions(PROJECT_ID, held, 'https://evil.example/projects');
    expect(rejected.find((action) => action.key === 'claim')?.href).toBe(`/projects/${PROJECT_ID}/claims?new=1`);
  });

  it('offers employee org creates only for destinations that already exist', () => {
    expect(buildEmployeeOrgQuickCreateActions(new Set([PERMISSIONS.PROJECTS_READ]))).toEqual([]);
    expect(
      buildEmployeeOrgQuickCreateActions(
        new Set([PERMISSIONS.EXPENSES_CREATE, PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.TIME_MANAGE]),
      ).map((action) => action.href),
    ).toEqual(['/employee/projects/new', '/employee/expenses/new', '/employee/hours/new']);
  });
});
