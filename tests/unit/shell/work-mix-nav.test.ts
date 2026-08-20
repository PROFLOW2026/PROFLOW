import { describe, expect, it } from 'vitest';
import {
  applyWorkMixToNavItems,
  NAV_ITEMS,
  visibleNavItems,
} from '@/components/shell/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';
import {
  parseWorkMix,
  workMixJobsPrimary,
  workMixSurfacesJobs,
} from '@/modules/tenancy/domain/work-mix';
import { resolveWorkListFacet } from '@/modules/projects/domain/work-list-facets';

function allModulesOff(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, false])) as ModuleVisibility;
}

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

describe('work mix nav IA', () => {
  it('parses work_mix setting values', () => {
    expect(parseWorkMix('jobs')).toBe('jobs');
    expect(parseWorkMix({ mode: 'mixed' })).toBe('mixed');
    expect(parseWorkMix('nope')).toBe('projects');
  });

  it('surfaces jobs for jobs/mixed mixes even when module is off', () => {
    expect(workMixSurfacesJobs('projects')).toBe(false);
    expect(workMixSurfacesJobs('jobs')).toBe(true);

    const permissions = new Set([PERMISSIONS.PROJECTS_READ, PERMISSIONS.EXPENSES_READ]);
    const jobsOnly = visibleNavItems(permissions, allModulesOff(), {
      workMix: 'jobs',
      persona: 'small_works',
    });
    expect(jobsOnly.some((item) => item.key === 'jobs')).toBe(true);
    expect(jobsOnly.find((item) => item.key === 'jobs')?.primaryOnMobile).toBe(true);
    expect(jobsOnly.find((item) => item.key === 'projects')?.primaryOnMobile).toBe(false);
    expect(jobsOnly.find((item) => item.key === 'projects')?.moreGroup).toBe('work');
  });

  it('keeps jobs hidden for projects-first orgs until module is on', () => {
    const permissions = new Set([PERMISSIONS.PROJECTS_READ]);
    const hidden = visibleNavItems(permissions, allModulesOff(), {
      workMix: 'projects',
      persona: 'project_contractor',
    });
    expect(hidden.some((item) => item.key === 'jobs')).toBe(false);

    const shown = visibleNavItems(permissions, allModulesOn(), {
      workMix: 'projects',
      persona: 'project_contractor',
    });
    expect(shown.some((item) => item.key === 'jobs')).toBe(true);
    expect(shown.find((item) => item.key === 'jobs')?.moreGroup).toBe('work');
  });

  it('marks both projects and jobs primary for mixed', () => {
    const mixed = applyWorkMixToNavItems(NAV_ITEMS, 'mixed');
    expect(workMixJobsPrimary('mixed')).toBe(true);
    expect(mixed.find((item) => item.key === 'projects')?.primaryOnMobile).toBe(true);
    expect(mixed.find((item) => item.key === 'jobs')?.primaryOnMobile).toBe(true);
    expect(mixed.find((item) => item.key === 'jobs')?.moreGroup).toBeUndefined();
  });

  it('maps list facets without inventing statuses', () => {
    expect(resolveWorkListFacet('new')).toEqual({ status: 'draft' });
    expect(resolveWorkListFacet('awaiting_payment')).toEqual({ awaitingPayment: true });
    expect(resolveWorkListFacet('active')).toEqual({ status: 'active' });
  });

  it('shows employees in More when workforce.read is granted even if module is off', () => {
    const permissions = new Set([
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.WORKFORCE_READ,
    ]);
    const items = visibleNavItems(permissions, allModulesOff(), {
      workMix: 'projects',
      persona: 'project_contractor',
    });
    const workforce = items.find((item) => item.key === 'workforce');
    expect(workforce).toBeDefined();
    expect(workforce?.href).toBe('/workforce/employees');
    expect(workforce?.moreGroup).toBe('people');
    expect(workforce?.module).toBeUndefined();
  });
});
