import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEnabledDesign, normalizeDesignPreference } from '@/shared/theme/design/config';
import { resolveDesignPreference, designFromAuthMetadata } from '@/shared/theme/design/auth-design';
import {
  EXPECTED_DESIGN_PAGE_COUNT,
  classifyDesignHref,
  classifyDesignRoute,
  designExclusionReason,
  familyBodyLandmark,
  familyUsesStructuralTemplate,
  isExcludedDesignFamily,
  productRouteUsesDesignShell,
} from '@/shared/theme/design/route-family';

function listPages(dir: string, root: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) listPages(abs, root, out);
    else if (name === 'page.tsx') out.push(relative(root, abs).replaceAll('\\', '/'));
  }
  return out;
}

describe('design preference', () => {
  it('keeps three designs and falls back to current', () => {
    expect(isEnabledDesign('current')).toBe(true);
    expect(isEnabledDesign('v9')).toBe(true);
    expect(isEnabledDesign('v10')).toBe(true);
    expect(normalizeDesignPreference('v9')).toBe('v9');
    expect(normalizeDesignPreference('classic')).toBe('current');
    expect(normalizeDesignPreference(null)).toBe('current');
  });

  it('does not treat a style token as a design', () => {
    expect(designFromAuthMetadata({ ui_design_preference: 'premium' })).toBeNull();
    expect(designFromAuthMetadata({ ui_style_preference: 'modern' })).toBeNull();
    expect(resolveDesignPreference(['v10', 'current'])).toBe('v10');
    expect(resolveDesignPreference([null, 'nope'])).toBe('current');
  });
});

describe('design href families', () => {
  it('selects the structural template for product screens and keeps exclusions on current chrome', () => {
    expect(classifyDesignHref('/he-IL')).toBe('home-dual');
    expect(classifyDesignHref('/he-IL/projects')).toBe('list');
    expect(classifyDesignHref('/he-IL/projects/11111111-1111-1111-1111-111111111111')).toBe('project-home');
    expect(classifyDesignHref('/he-IL/projects/11111111-1111-1111-1111-111111111111/edit')).toBe('form');
    expect(classifyDesignHref('/he-IL/financials')).toBe('finance');
    expect(classifyDesignHref('/he-IL/employee')).toBe('surface-home');
    expect(classifyDesignHref('/he-IL/contractor/finance')).toBe('surface-home');
    expect(classifyDesignHref('/he-IL/contractor/projects/11111111-1111-1111-1111-111111111111')).toBe('project-home');
    expect(classifyDesignHref('/he-IL/work/list')).toBe('list');
    expect(classifyDesignHref('/he-IL/projects/11111111-1111-1111-1111-111111111111/takeoff')).toBe('engine');
    expect(classifyDesignHref('/he-IL/tools')).toBe('engine');
    expect(classifyDesignHref('/he-IL/employee/tools')).toBe('engine');
    expect(classifyDesignHref('/he-IL/contractor/tools')).toBe('engine');
    expect(classifyDesignHref('/he-IL/projects')).toBe('list');
    expect(classifyDesignHref('/he-IL/settings')).toBe('settings');
    expect(classifyDesignHref('/he-IL/sign-in')).toBe('public-auth');
    expect(classifyDesignHref('/he-IL/dev/design-lab')).toBe('dev-harness');
    expect(classifyDesignHref('/he-IL/live/token')).toBe('public-live');

    expect(familyUsesStructuralTemplate('list')).toBe(true);
    expect(familyUsesStructuralTemplate('finance')).toBe(true);
    expect(familyUsesStructuralTemplate('project-home')).toBe(true);
    expect(familyUsesStructuralTemplate('detail')).toBe(true);
    expect(familyUsesStructuralTemplate('form')).toBe(true);
    expect(familyUsesStructuralTemplate('surface-home')).toBe(true);
    expect(familyUsesStructuralTemplate('print')).toBe(false);
    expect(familyUsesStructuralTemplate('engine')).toBe(false);
    expect(familyBodyLandmark('list', 'v9')).toBe('v9-table');
    expect(familyBodyLandmark('list', 'v10')).toBe('v10-scan');
    expect(familyBodyLandmark('project-home', 'v9')).toBe('v9-hero');
    expect(familyBodyLandmark('finance', 'v10')).toBe('v10-glance');
    expect(familyBodyLandmark('print', 'v9')).toBeUndefined();
    expect(familyBodyLandmark('engine', 'v10')).toBeUndefined();
    expect(classifyDesignRoute('src/app/[locale]/(app)/projects/page.tsx')).toBe('list');
    expect(classifyDesignRoute('src/app/[locale]/(app)/work/list/page.tsx')).toBe('list');
    expect(classifyDesignRoute('src/app/[locale]/(app)/projects/[projectId]/page.tsx')).toBe('project-home');
    expect(classifyDesignRoute('src/app/[locale]/(app)/projects/[projectId]/tasks/[taskId]/page.tsx')).toBe('detail');
    expect(classifyDesignRoute('src/app/[locale]/(app)/settings/portal/page.tsx')).toBe('settings');
  });
});

describe('design route coverage', () => {
  const root = process.cwd();
  const pages = listPages(join(root, 'src', 'app'), root).sort();

  it('classifies every page exactly once and keeps the recounted total', () => {
    expect(pages).toHaveLength(EXPECTED_DESIGN_PAGE_COUNT);
    const families = new Set(pages.map((page) => classifyDesignRoute(page)));
    expect(families.size).toBeGreaterThan(3);
    for (const page of pages) {
      const family = classifyDesignRoute(page);
      if (isExcludedDesignFamily(family)) {
        expect(designExclusionReason(family).length).toBeGreaterThan(10);
        expect(productRouteUsesDesignShell(page)).toBe(false);
      } else {
        expect(productRouteUsesDesignShell(page)).toBe(true);
      }
    }
  });
});
