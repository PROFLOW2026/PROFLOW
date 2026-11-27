import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyDesignRoute,
  isExcludedDesignFamily,
  productRouteUsesDesignShell,
} from '@/shared/theme/design/route-family';

const ROOT = process.cwd();

const EMPLOYEE_PREFIX = 'src/app/[locale]/employee/(shell)/';
const CONTRACTOR_PREFIX = 'src/app/[locale]/contractor/(portal)/';
const MAIN_APP_PREFIX = 'src/app/[locale]/(app)/';

const EMPLOYEE_HOME = `${EMPLOYEE_PREFIX}page.tsx`;
const CONTRACTOR_HOME = `${CONTRACTOR_PREFIX}page.tsx`;
const CONTRACTOR_FINANCE = `${CONTRACTOR_PREFIX}finance/page.tsx`;
const CONTRACTOR_WORK = `${CONTRACTOR_PREFIX}work/page.tsx`;
const CONTRACTOR_MORE = `${CONTRACTOR_PREFIX}more/page.tsx`;

const MAIN_PROJECT_HOME = `${MAIN_APP_PREFIX}projects/[projectId]/page.tsx`;
const EMPLOYEE_PROJECT_HOME = `${EMPLOYEE_PREFIX}projects/[projectId]/page.tsx`;
const CONTRACTOR_PROJECT_HOME = `${CONTRACTOR_PREFIX}projects/[projectId]/page.tsx`;

function listPages(dir: string, root: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) listPages(abs, root, out);
    else if (name === 'page.tsx') out.push(relative(root, abs).replaceAll('\\', '/'));
  }
  return out;
}

function isEnginePage(rel: string): boolean {
  return (
    rel.includes('/takeoff/') ||
    rel.endsWith('/takeoff/page.tsx') ||
    rel.includes('/infrastructure/') ||
    rel.includes('/boq-measure/') ||
    rel.includes('/plans/')
  );
}

function isPrintPage(rel: string): boolean {
  return rel.includes('/print/');
}

const pages = listPages(join(ROOT, 'src', 'app'), ROOT).sort();

const employeePages = pages.filter((page) => page.startsWith(EMPLOYEE_PREFIX));
const contractorPages = pages.filter((page) => page.startsWith(CONTRACTOR_PREFIX));
const mainAppPages = pages.filter((page) => page.startsWith(MAIN_APP_PREFIX));

describe('design surfaces', () => {
  it('keeps every employee shell page on the product design shell', () => {
    expect(employeePages.length, 'employee shell pages').toBeGreaterThan(0);
    for (const page of employeePages) {
      const family = classifyDesignRoute(page);
      expect(isExcludedDesignFamily(family), page).toBe(false);
      expect(productRouteUsesDesignShell(page), page).toBe(true);
    }
  });

  it('keeps every contractor portal page on the product design shell', () => {
    expect(contractorPages.length, 'contractor portal pages').toBeGreaterThan(0);
    for (const page of contractorPages) {
      const family = classifyDesignRoute(page);
      expect(isExcludedDesignFamily(family), page).toBe(false);
      expect(productRouteUsesDesignShell(page), page).toBe(true);
    }
  });

  it('keeps every main-app page on the product design shell', () => {
    expect(mainAppPages.length, 'main-app pages').toBeGreaterThan(0);
    for (const page of mainAppPages) {
      const family = classifyDesignRoute(page);
      expect(isExcludedDesignFamily(family), page).toBe(false);
      expect(productRouteUsesDesignShell(page), page).toBe(true);
    }
  });

  it('classifies employee home as surface-home', () => {
    expect(pages, EMPLOYEE_HOME).toContain(EMPLOYEE_HOME);
    expect(classifyDesignRoute(EMPLOYEE_HOME), EMPLOYEE_HOME).toBe('surface-home');
  });

  it('classifies contractor home, finance, work, and more as surface-home', () => {
    for (const page of [CONTRACTOR_HOME, CONTRACTOR_FINANCE, CONTRACTOR_WORK, CONTRACTOR_MORE]) {
      expect(pages, page).toContain(page);
      expect(classifyDesignRoute(page), page).toBe('surface-home');
    }
  });

  it('classifies main, employee, and contractor project roots as project-home', () => {
    for (const page of [MAIN_PROJECT_HOME, EMPLOYEE_PROJECT_HOME, CONTRACTOR_PROJECT_HOME]) {
      expect(pages, page).toContain(page);
      expect(classifyDesignRoute(page), page).toBe('project-home');
    }
  });

  it('classifies takeoff, infrastructure, plans, and boq-measure pages as engine', () => {
    const enginePages = pages.filter(isEnginePage);
    expect(enginePages.length, 'engine pages').toBeGreaterThan(0);
    for (const page of enginePages) {
      expect(classifyDesignRoute(page), page).toBe('engine');
    }
  });

  it('classifies print pages as print', () => {
    const printPages = pages.filter(isPrintPage);
    expect(printPages.length, 'print pages').toBeGreaterThan(0);
    for (const page of printPages) {
      expect(classifyDesignRoute(page), page).toBe('print');
    }
  });
});
