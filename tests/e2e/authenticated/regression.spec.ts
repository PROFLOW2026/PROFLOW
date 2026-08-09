import { expect, test, type Page } from '@playwright/test';
import {
  assertFabClearsBottomNav,
  assertNoPageHorizontalOverflow,
  CRITICAL_OVERFLOW_WIDTHS,
  DESKTOP_OVERFLOW_WIDTHS,
  MOBILE_NAV,
  MOBILE_OVERFLOW_WIDTHS,
  PAGE_OVERFLOW_WIDTHS,
  withViewport,
} from '../fixtures/layout';
import { EN_UI_RESIDUE, he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

const world = loadWorld();

test.describe.configure({ timeout: 180_000 });

async function openHebrewFinancials(page: Page): Promise<void> {
  await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
  await expect(page.getByRole('heading', { name: 'שיפוץ דירה ברמת גן' })).toBeVisible();
  await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.financials })).toHaveAttribute(
    'data-state',
    'active',
  );
  await expect(page.getByRole('heading', { name: he.financial.currentContractValue })).toBeVisible();
}

test.describe('authenticated page overflow', () => {
  const routes: {
    name: string;
    path: () => string;
    ready: (page: Page) => Promise<void>;
  }[] = [
    {
      name: 'dashboard',
      path: () => '/he-IL',
      ready: async (page) => {
        await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toBeVisible();
      },
    },
    {
      name: 'reports',
      path: () => '/he-IL/reports',
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();
      },
    },
    {
      name: 'projects',
      path: () => '/he-IL/projects',
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: he.projects.title, level: 1 })).toBeVisible();
      },
    },
    {
      name: 'expenses',
      path: () => '/he-IL/expenses',
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: he.expenses.title, level: 1 })).toBeVisible();
      },
    },
    {
      name: 'project detail',
      path: () => `/he-IL/projects/${world.projectId}`,
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: 'שיפוץ דירה ברמת גן' })).toBeVisible();
      },
    },
    {
      name: 'settings',
      path: () => '/he-IL/settings/profile',
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: he.settings.profile.title, level: 1 })).toBeVisible();
      },
    },
  ];

  for (const route of routes) {
    test(`${route.name} has no horizontal overflow across critical widths`, async ({ page }) => {
      for (const width of CRITICAL_OVERFLOW_WIDTHS) {
        await withViewport(page, width, async () => {
          await page.goto(route.path());
          await route.ready(page);
          await assertNoPageHorizontalOverflow(page, `${route.name}@${width}`);
        });
      }
    });
  }

  test('reports has no horizontal overflow across full screenshot matrix', async ({ page }) => {
    for (const width of PAGE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL/reports');
        await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();
        await assertNoPageHorizontalOverflow(page, `reports-full@${width}`);
      });
    }
  });
});

test.describe('Hebrew UI has no English residue on critical routes', () => {
  test('project financials show Hebrew headings and hide known English labels', async ({ page }) => {
    await openHebrewFinancials(page);

    await expect(page.getByRole('heading', { name: he.financial.currentContractValue })).toBeVisible();
    await expect(page.getByText(he.financial.originalContractValue, { exact: true }).first()).toBeVisible();

    for (const phrase of EN_UI_RESIDUE) {
      await expect(page.getByText(phrase, { exact: true })).toHaveCount(0);
    }
  });

  test('reports page shows Hebrew title and commercial section', async ({ page }) => {
    await page.goto('/he-IL/reports');
    await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: he.dashboard.reports.sections.commercial, level: 2 })).toBeVisible();
    await expect(page.getByText('Original contract value', { exact: true })).toHaveCount(0);
    await expect(page.getByText(he.financial.originalContractValue).first()).toBeVisible();
  });

  test('settings profile shows Hebrew headings', async ({ page }) => {
    await page.goto('/he-IL/settings/profile');
    await expect(page.getByRole('heading', { name: he.settings.profile.title, level: 1 })).toBeVisible();
    await expect(page.getByText(he.settings.profile.language)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  });
});

test.describe('mobile reports layout', () => {
  test('reports stacks cards without desktop canvas blank side on phone widths', async ({ page }) => {
    for (const width of MOBILE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL/reports');
        await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();
        await expect(
          page.getByRole('heading', { name: he.dashboard.reports.sections.commercial, level: 2 }),
        ).toBeVisible();

        const layout = await page.evaluate(() => {
          const main = document.querySelector('main') ?? document.body;
          const title = document.querySelector('h1');
          const desktopTable = document.querySelector('main table');
          const desktopTableVisible = desktopTable
            ? getComputedStyle(desktopTable).display !== 'none' &&
              desktopTable.getBoundingClientRect().width > 0
            : false;
          return {
            mainWidth: main.getBoundingClientRect().width,
            titleOverflows: title ? title.scrollWidth > title.clientWidth + 1 : false,
            desktopTableVisible,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });

        expect(layout.mainWidth).toBeLessThanOrEqual(width + 1);
        expect(layout.titleOverflows).toBe(false);
        // Phone strategy: no squeezed desktop table (cards via ResponsiveTable).
        expect(layout.desktopTableVisible).toBe(false);
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
        await assertNoPageHorizontalOverflow(page, `reports@${width}`);
      });
    }
  });

  test('reports uses cards (not page-widening table) at 768 tablet width', async ({ page }) => {
    await withViewport(page, 768, async () => {
      await page.goto('/he-IL/reports');
      await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();

      const layout = await page.evaluate(() => {
        // ResponsiveTable hides desktop branch below lg via `.hidden.lg:block`.
        const desktopBranch = document.querySelector('main .hidden.lg\\:block');
        let desktopShown = false;
        if (desktopBranch) {
          desktopShown = getComputedStyle(desktopBranch).display !== 'none';
        }
        return {
          desktopShown,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      expect(layout.desktopShown).toBe(false);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      await assertNoPageHorizontalOverflow(page, 'reports@768');
    });
  });
});

test.describe('bottom nav / FAB overlap heuristics', () => {
  test('FAB clears bottom nav on phone widths', async ({ page }) => {
    for (const width of MOBILE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL');
        await expect(page.locator(MOBILE_NAV)).toBeVisible();
        await assertFabClearsBottomNav(page);
      });
    }
  });

  test('reports content clears bottom nav and FAB on phone widths', async ({ page }) => {
    for (const width of MOBILE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL/reports');
        await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();

        const clearance = await page.evaluate((navSelector) => {
          const nav = document.querySelector(navSelector);
          const main = document.querySelector('main');
          if (!nav || !main) return null;
          const mainStyle = getComputedStyle(main);
          const paddingBottom = Number.parseFloat(mainStyle.paddingBottom) || 0;
          return { paddingBottom };
        }, MOBILE_NAV);

        expect(clearance).not.toBeNull();
        // Shell reserves bottom padding so content is not trapped under the bar/FAB.
        expect(clearance!.paddingBottom).toBeGreaterThanOrEqual(48);
        await assertFabClearsBottomNav(page);
      });
    }
  });

  test('desktop widths hide fixed bottom nav', async ({ page }) => {
    for (const width of DESKTOP_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL');
        await expect(
          page.getByRole('navigation', { name: he.common.a11y.mainNavigation }).first(),
        ).toBeVisible();

        // Prefer geometry over display alone — fixed nav can remain in DOM.
        const metrics = await page.locator(MOBILE_NAV).evaluate((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            display: style.display,
            visibility: style.visibility,
            height: rect.height,
            width: rect.width,
            desktopMq: window.matchMedia('(min-width: 1024px)').matches,
          };
        });

        expect(metrics.desktopMq, `viewport ${width} should match lg`).toBe(true);
        expect(
          metrics.display === 'none' || metrics.height === 0 || metrics.visibility === 'hidden',
          `bottom nav still painted @${width}: ${JSON.stringify(metrics)}`,
        ).toBe(true);
      });
    }
  });
});
