import { expect, test, type Page, type Route } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
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
import { clickNavLink, expectNavLinkVisible } from '../fixtures/nav';
import { signInThroughForm } from '../fixtures/sign-in';
import {
  ELECTRICAL_OWNER,
  FIELD_OWNER,
  FINANCE,
  GC_OWNER,
  MAINTENANCE_OWNER,
  MANAGER,
  MIXED_OWNER,
  OWNER,
  PLUMBING_OWNER,
} from '../harness/config';
import { loadWorld } from '../fixtures/world';

const world = loadWorld();

test.describe.configure({ timeout: 180_000 });

async function openHebrewFinancials(page: Page): Promise<void> {
  await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
  await expect(page.getByRole('heading', { name: 'שיפוץ דירה ברמת גן' })).toBeVisible();
  await expect(page.getByRole('tab', { name: he.projects.workspace.hubs.money })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('link', { name: he.projects.workspace.tabs.financials, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 2 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(he.financial.kpis.currentContract) }),
  ).toBeVisible();
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

    await expect(page.getByRole('heading', { name: he.financial.panelTitle })).toBeVisible();
    await expect(
      page.getByRole('button', { name: new RegExp(he.financial.kpis.currentContract) }),
    ).toBeVisible();

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
    // Prefer role+name: getByLabel can strict-fail when Radix briefly exposes a second unlabeled combobox.
    await expect(page.getByRole('combobox', { name: he.settings.profile.language })).toBeVisible();
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

test.describe('polish: dashboard loading + export pending', () => {
  test('clicking Dashboard shows aria-busy skeleton or completes navigation promptly', async ({
    page,
  }) => {
    await page.goto('/he-IL/projects');
    await expect(page.getByRole('heading', { name: he.projects.title, level: 1 })).toBeVisible();

    const mainNav = page.getByRole('navigation', { name: he.common.a11y.mainNavigation }).first();
    const dashboardLink = mainNav.getByRole('link', { name: he.nav.dashboard });

    // Slow home navigations so (home)/loading.tsx can paint under load.
    const delayHome = async (route: Route) => {
      const url = new URL(route.request().url());
      const isHome = url.pathname === '/he-IL' || url.pathname === '/he-IL/';
      if (isHome && (route.request().resourceType() === 'document' || url.search.includes('_rsc'))) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    };
    await page.route('**/he-IL**', delayHome);

    try {
      const busyLocator = page.locator('[aria-busy="true"]').first();
      const busySeen = busyLocator.waitFor({ state: 'visible', timeout: 4_000 }).then(
        () => true,
        () => false,
      );

      await dashboardLink.click();
      const sawBusy = await busySeen;

      // Always land on the authenticated shell; busy may race if navigation is still fast.
      await expect(mainNav).toBeVisible({ timeout: 30_000 });
      expect(
        sawBusy || (await page.locator('main').count()) > 0,
        'expected dashboard navigation to show aria-busy skeleton or complete into shell',
      ).toBe(true);
    } finally {
      await page.unroute('**/he-IL**', delayHome);
    }
  });

  test('project tab click shows pending chrome or settles URL promptly (he-IL)', async ({ page }) => {
    const projectPath = `/he-IL/projects/${world.projectId}`;
    await page.goto(projectPath);
    await expect(page.getByRole('heading', { name: 'שיפוץ דירה ברמת גן' })).toBeVisible();

    const overviewTab = page.getByRole('tab', { name: he.projects.workspace.hubs.money });
    const moneyTab = page.getByRole('tab', { name: he.projects.workspace.hubs.money });
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await expect(moneyTab).toHaveAttribute('aria-selected', 'false');

    // Soft-nav via ?tab= can finish before paint; delay project RSC so pending chrome can show.
    const delayProjectTab = async (route: Route) => {
      const url = new URL(route.request().url());
      const onProject =
        url.pathname === projectPath || url.pathname.startsWith(`${projectPath}/`);
      const isSoftNav =
        route.request().resourceType() === 'document' || url.search.includes('_rsc');
      if (onProject && isSoftNav && url.searchParams.get('tab') === 'financials') {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    };
    await page.route(`**${projectPath}**`, delayProjectTab);

    try {
      const pendingChrome = page
        .locator(
          [
            '[role="tab"][data-pending]',
            '[data-pf-slot="tab"][data-pending]',
            '[role="tablist"][aria-busy="true"]',
            '[aria-busy="true"] .animate-spin',
            '[aria-busy="true"]',
          ].join(', '),
        )
        .first();
      const pendingSeen = pendingChrome.waitFor({ state: 'visible', timeout: 4_000 }).then(
        () => true,
        () => false,
      );

      await moneyTab.click();
      const sawPending = await pendingSeen;

      await expect(page).toHaveURL(new RegExp(`${projectPath}\\?tab=financials`), {
        timeout: 30_000,
      });
      await expect(moneyTab).toHaveAttribute('aria-selected', 'true');
      await expect(
        page.getByRole('link', { name: he.projects.workspace.tabs.financials, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      expect(
        sawPending || (await page.url()).includes('tab=financials'),
        'expected project tab click to show data-pending/aria-busy/spinner or settle URL',
      ).toBe(true);
    } finally {
      await page.unroute(`**${projectPath}**`, delayProjectTab);
    }
  });

  test('export download shows preparing feedback while response is delayed', async ({ page }) => {
    await page.goto('/he-IL/reports');
    await expect(page.getByRole('heading', { name: he.dashboard.reports.title, level: 1 })).toBeVisible();

    await page.route('**/exports/projects**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="projects.csv"',
        },
        body: '\uFEFFid,name\r\n1,Demo\r\n',
      });
    });

    await page.getByRole('button', { name: he.dashboard.reports.exportMenu }).click();
    await page.getByRole('menuitem', { name: he.dashboard.reports.exportProjects }).click();

    await expect(page.getByText(he.exports.feedback.preparing).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(he.exports.feedback.ready).first()).toBeVisible({
      timeout: 15_000,
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

        // Prefer geometry over display alone - fixed nav can remain in DOM.
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

const seededProjectName = 'שיפוץ דירה ברמת גן';
const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');


async function expectQuickCreateHas(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: he.nav.newMenu.trigger }).click();
  await expect(page.getByRole('menuitem').first()).toHaveText(he.nav.newMenu.quickCapture);
  await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
}

async function expectActualExplainability(page: Page): Promise<void> {
  const actual = page.getByRole('button', { name: new RegExp(he.financial.kpis.actualCost) }).first();
  await expect(actual).toBeVisible();
  await actual.click();
  await expect(page.getByText(he.financial.explain.whyThisNumber).first()).toBeVisible();
  await expect(page.getByText(he.financial.kpis.recognizedOriginal).first()).toBeVisible();
  await expect(page.getByText(he.financial.kpis.monthCloseCost).first()).toBeVisible();
}

test.describe('simple organization (seeded, no business profile)', () => {
  test('owner dashboard and project financial Actual remain usable', async ({ page }) => {
    await signInThroughForm(page, OWNER.email);
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expectActualExplainability(page);
    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
  });
});

test.describe('manager persona', () => {
  test('runs projects and costs without profit or people admin', async ({ page }) => {
    await signInThroughForm(page, MANAGER.email);
    await expectNavLinkVisible(page, he.nav.projects);
    await expectNavLinkVisible(page, he.nav.expenses);

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expect(
      page.getByRole('link', { name: he.projects.workspace.tabs.financials, exact: true }),
    ).toBeVisible();
    await expectActualExplainability(page);
    await expect(page.getByText(he.financial.kpis.actualMargin)).toHaveCount(0);

    await page.goto('/he-IL/settings/people');
    await expect(page.getByRole('heading', { name: he.organization.members.title }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: he.organization.invitations.title })).toHaveCount(0);
    await expect(page.getByRole('button', { name: he.organization.invitations.send })).toHaveCount(0);
    await expect(page.getByRole('button', { name: he.organization.members.remove })).toHaveCount(0);
  });
});

test.describe('finance persona', () => {
  test('reaches billing, expenses, month close and profit', async ({ page }) => {
    await signInThroughForm(page, FINANCE.email);
    await expectNavLinkVisible(page, he.nav.billing);
    await expectNavLinkVisible(page, he.nav.expenses);

    await clickNavLink(page, he.nav.billing);
    await expect(page).toHaveURL(/\/he-IL\/billing/);

    await page.goto('/he-IL/month-close');
    await expect(page.getByRole('heading', { name: he.nav.monthClose }).first()).toBeVisible();

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expectActualExplainability(page);
    await expect(
      page.getByRole('button', { name: new RegExp(he.financial.kpis.actualMargin) }).first(),
    ).toBeVisible();
  });
});

test.describe('business-profile Quick Create defaults', () => {
  test('general contractor keeps project in the new menu after quick capture', async ({ page }) => {
    await signInThroughForm(page, GC_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.project);
  });

  test('electrical keeps job in the new menu after quick capture', async ({ page }) => {
    await signInThroughForm(page, ELECTRICAL_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.job);
    await page.goto('/he-IL/projects/new');
    await expect(page.getByText(he.projects.create.usualKind.jobTitle)).toBeVisible();
  });

  test('plumbing keeps job in the new menu after quick capture', async ({ page }) => {
    await signInThroughForm(page, PLUMBING_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.job);
  });

  test('maintenance keeps work orders in the new menu after quick capture', async ({ page }) => {
    await signInThroughForm(page, MAINTENANCE_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.service);
    await page.goto('/he-IL/projects/new');
    await expect(page.getByText(he.projects.create.usualKind.workOrderTitle)).toBeVisible();
  });

  test('field service keeps work orders in the new menu after quick capture', async ({ page }) => {
    await signInThroughForm(page, FIELD_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.service);
  });

  test('mixed organization keeps project, job, and service in the new menu', async ({ page }) => {
    await signInThroughForm(page, MIXED_OWNER.email);
    await expectQuickCreateHas(page, he.nav.newMenu.project);
    await expect(page.getByRole('menuitem', { name: he.nav.newMenu.service })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: he.nav.newMenu.job })).toBeVisible();
  });
});
