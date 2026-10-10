import { describe, expect, it } from 'vitest';
import {
  activeContractorMobileTab,
  buildContractorMobileNavItems,
  CONTRACTOR_MOBILE_TABS,
  CONTRACTOR_MOBILE_TAB_KEYS,
  PORTAL_TODAY_SECTION_IDS,
} from '@/modules/contractor-portal/domain/mobile-tabs';
import { buildPortalMobileNav } from '@/modules/contractor-portal/domain/nav';
import { portalHref } from '@/modules/contractor-portal/domain/routes';

describe('contractor portal five-tab mobile navigation', () => {
  it('defines exactly five semantic tabs in product order', () => {
    expect(CONTRACTOR_MOBILE_TAB_KEYS).toEqual(['today', 'projects', 'work', 'finance', 'more']);
    expect(CONTRACTOR_MOBILE_TABS).toHaveLength(5);
  });

  it('builds hub hrefs for all five tabs', () => {
    const items = buildContractorMobileNavItems();
    expect(items.map((item) => item.key)).toEqual([...CONTRACTOR_MOBILE_TAB_KEYS]);
    expect(items.map((item) => item.href)).toEqual([
      '/contractor',
      '/contractor/projects',
      '/contractor/work',
      '/contractor/finance',
      '/contractor/more',
    ]);
    expect(buildPortalMobileNav()).toEqual(items);
  });

  it('resolves active tab from hub and deep project routes', () => {
    expect(activeContractorMobileTab('/contractor')).toBe('today');
    expect(activeContractorMobileTab('/contractor/projects')).toBe('projects');
    expect(activeContractorMobileTab('/contractor/work')).toBe('work');
    expect(activeContractorMobileTab('/contractor/finance')).toBe('finance');
    expect(activeContractorMobileTab('/contractor/more')).toBe('more');

    expect(activeContractorMobileTab('/contractor/projects/p1')).toBe('projects');
    expect(activeContractorMobileTab('/contractor/projects/p1/tasks/t1')).toBe('work');
    expect(activeContractorMobileTab('/contractor/projects/p1/claims')).toBe('finance');
    expect(activeContractorMobileTab('/contractor/projects/p1/documents')).toBe('more');
    expect(activeContractorMobileTab('/contractor/account')).toBe('more');
  });

  it('keeps TODAY dashboard sections limited to urgent surfaces', () => {
    expect(PORTAL_TODAY_SECTION_IDS).toEqual(['today', 'overdueTasks', 'acknowledgements', 'notifications']);
  });

  it('exposes live portal hrefs for each hub route key', () => {
    expect(portalHref('dashboard')).toBe('/contractor');
    expect(portalHref('portal.projects')).toBe('/contractor/projects');
    expect(portalHref('portal.work')).toBe('/contractor/work');
    expect(portalHref('portal.finance')).toBe('/contractor/finance');
    expect(portalHref('portal.more')).toBe('/contractor/more');
  });
});
