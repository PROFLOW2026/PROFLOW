import { describe, expect, it } from 'vitest';
import {
  PROJECT_WORK_NAV_LINKS,
  projectWorkNavHref,
  projectWorkNavLinksForSurface,
} from '@/modules/project-workspace/domain/project-work-nav-links';

const PROJECT_ID = '02dd65ce-adbb-4cdf-8c2e-613832ecd622';
const OWNER_ROOT = `/projects/${PROJECT_ID}`;

describe('project work nav links (REG-007)', () => {
  it('exposes six workspace nav actions on owner surface', () => {
    expect(PROJECT_WORK_NAV_LINKS).toHaveLength(6);
    expect(projectWorkNavLinksForSurface(OWNER_ROOT).map((l) => l.labelKey)).toEqual([
      'tasks',
      'boards',
      'calendar',
      'timeline',
      'files',
      'meetings',
    ]);
  });

  it('maps owner hrefs to UWM routes, documents tab, and site meetings', () => {
    expect(projectWorkNavHref(OWNER_ROOT, PROJECT_WORK_NAV_LINKS[0]!)).toBe(
      `${OWNER_ROOT}/tasks`,
    );
    expect(projectWorkNavHref(OWNER_ROOT, PROJECT_WORK_NAV_LINKS[4]!)).toBe(
      `${OWNER_ROOT}?tab=documents`,
    );
    expect(projectWorkNavHref(OWNER_ROOT, PROJECT_WORK_NAV_LINKS[5]!)).toBe(
      `${OWNER_ROOT}/site-meetings`,
    );
  });

  it('omits timeline on employee surface and maps boards to board', () => {
    const employeeRoot = `/employee/projects/${PROJECT_ID}`;
    const labels = projectWorkNavLinksForSurface(employeeRoot).map((l) => l.labelKey);
    expect(labels).not.toContain('timeline');
    const boards = PROJECT_WORK_NAV_LINKS.find((l) => l.labelKey === 'boards')!;
    expect(projectWorkNavHref(employeeRoot, boards)).toBe(`${employeeRoot}/board`);
  });
});
