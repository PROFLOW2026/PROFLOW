import { describe, expect, it } from 'vitest';
import { sectionNavTargetSettled } from '@/components/ui/section-nav-target';
import {
  dashboardWorkKindHref,
  laborPoolForWorkKindFilter,
  scopeProjectPaidFactsToRollup,
} from '@/modules/financials/domain/work-kind-filter';

describe('dashboard work-kind scope', () => {
  it('keeps an empty labor pool visible on a facet and hidden on all', () => {
    expect(
      laborPoolForWorkKindFilter({ filter: 'all', allocatedHours: 0, pendingHours: 0 }),
    ).toBeNull();
    expect(
      laborPoolForWorkKindFilter({ filter: 'job', allocatedHours: 0, pendingHours: 0 }),
    ).toEqual({ allocatedHours: 0, unallocatedHours: 0, totalHours: 0 });
    expect(
      laborPoolForWorkKindFilter({ filter: 'project', allocatedHours: 4, pendingHours: 1 }),
    ).toEqual({ allocatedHours: 4, unallocatedHours: 1, totalHours: 5 });
  });

  it('limits paid-cash facts to the selected rollup and keeps every fact on all', () => {
    const facts = [
      { projectId: 'project-1' },
      { projectId: 'job-1' },
      { projectId: null },
    ];
    expect(scopeProjectPaidFactsToRollup(facts, 'all', ['project-1'])).toEqual(facts);
    expect(scopeProjectPaidFactsToRollup(facts, 'project', ['project-1'])).toEqual([
      { projectId: 'project-1' },
    ]);
    expect(scopeProjectPaidFactsToRollup(facts, 'job', [])).toEqual([]);
  });

  it('builds dashboard hrefs that keep the month and swap only the work kind', () => {
    expect(dashboardWorkKindHref('/', 'all', null)).toBe('/');
    expect(dashboardWorkKindHref('/', 'project', '2026-10')).toBe(
      '/?month=2026-10&workKind=project',
    );
    expect(dashboardWorkKindHref('/', 'job', '2026-10')).toBe('/?month=2026-10&workKind=job');
    expect(dashboardWorkKindHref('/', 'all', '2026-10')).toBe('/?month=2026-10');
  });

  it('treats a query-only tab change as settled once the address matches', () => {
    expect(sectionNavTargetSettled('/', '', '/')).toBe(true);
    expect(sectionNavTargetSettled('/', '', '/?workKind=project')).toBe(false);
    expect(sectionNavTargetSettled('/', 'workKind=project', '/?workKind=project')).toBe(true);
    expect(sectionNavTargetSettled('/', 'workKind=job', '/?workKind=project')).toBe(false);
    expect(
      sectionNavTargetSettled('/', 'workKind=project&month=2026-10', '/?month=2026-10&workKind=project'),
    ).toBe(true);
    expect(sectionNavTargetSettled('/', 'month=2026-10', '/?month=2026-10')).toBe(true);
  });
});
