import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import { OWNER } from '../harness/config';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';
const seededClientName = 'משפחת אברהמי';
const seededExpenseDescription = 'כבלים וחומרי חשמל';

const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');
const seededExpenseFormatted = formatMoney({ amount: '12000', currency: 'ILS' }, 'he-IL');

test.describe('signed-in owner', () => {
  test('lands on the dashboard with Hebrew RTL shell', async ({ page }) => {
    await page.goto('/he-IL');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
    await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toBeVisible();
    await expect(page.getByRole('link', { name: he.nav.dashboard })).toBeVisible();
  });

  test('project workspace shows seeded financial, expense and detail content', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}`);

    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.overview })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.financials })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.expenses })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.details })).toBeVisible();

    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();

    await page.getByRole('tab', { name: he.projects.workspace.tabs.financials }).click();
    await expect(page.getByRole('heading', { name: he.financial.currentContractValue, level: 3 })).toBeVisible();
    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
    await expect(page.getByText(seededExpenseFormatted).first()).toBeVisible();

    await page.getByRole('tab', { name: he.projects.workspace.tabs.expenses }).click();
    await expect(page.getByText(seededExpenseDescription)).toBeVisible();
    await expect(page.getByText(seededExpenseFormatted).first()).toBeVisible();

    await page.getByRole('tab', { name: he.projects.workspace.tabs.details }).click();
    await expect(page.getByRole('textbox', { name: he.common.labels.name, exact: true })).toHaveValue(
      seededProjectName,
    );
    await expect(page.getByLabel(he.projects.details.clientLabel)).toContainText(seededClientName);
    await expect(page.getByLabel(he.projects.details.locationLabel)).toHaveValue('רמת גן');
  });

  test('creates a project through the UI and lists it', async ({ page }) => {
    const projectName = `פרויקט בדיקה ${Date.now()}`;

    await page.goto('/he-IL/projects/new');
    await page.getByLabel(he.projects.create.nameLabel).fill(projectName);
    await page.getByRole('button', { name: he.projects.create.submit }).click();

    await expect(page).toHaveURL(new RegExp(`/he-IL/projects/[0-9a-f-]+$`));
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

    await page.goto('/he-IL/projects');
    await expect(page.getByRole('link', { name: projectName })).toBeVisible();
  });

  test('captures an expense and reflects it on the project', async ({ page }) => {
    const description = `הוצאת בדיקה ${Date.now()}`;
    const amount = '3500';
    const amountFormatted = formatMoney({ amount, currency: 'ILS' }, 'he-IL');

    await page.goto(`/he-IL/expenses/new?projectId=${world.projectId}`);
    await page.getByLabel(he.expenses.fields.amount).fill(amount);
    await page.getByLabel(he.expenses.fields.description).fill(description);
    await page.getByRole('button', { name: he.common.actions.save }).click();

    await expect(page).toHaveURL(new RegExp(`/he-IL/expenses/[0-9a-f-]+$`), { timeout: 30_000 });
    await expect(page.getByLabel(he.expenses.fields.description)).toHaveValue(description);
    await expect(page.getByText(amountFormatted).first()).toBeVisible();

    await page.goto(`/he-IL/projects/${world.projectId}`);
    await page.getByRole('tab', { name: he.projects.workspace.tabs.expenses }).click();
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByText(amountFormatted).first()).toBeVisible();
  });

  test('does not reveal another tenant project', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.otherProjectId}`);

    await expect(page.getByRole('heading', { name: he.errors.notFoundPage.title })).toBeVisible();
    await expect(page.getByText(he.errors.notFoundPage.body)).toBeVisible();
    await expect(page.getByText('פרויקט של דייר אחר')).toHaveCount(0);
  });

  test('settings people and activity screens render seeded data', async ({ page }) => {
    await page.goto('/he-IL/settings/people');

    await expect(page.getByRole('heading', { name: he.organization.members.title, level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: /דנה כהן/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /אבי מזרחי/ })).toBeVisible();

    await page.goto('/he-IL/settings/activity');
    await expect(page.getByRole('heading', { name: he.settings.activity.title, level: 1 })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: he.settings.activity.columnWhen })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: he.settings.activity.columnAction })).toBeVisible();
    await expect(page.getByText(he.settings.activity.empty)).toHaveCount(0);
  });

  test('signs out and returns to sign-in without the shell', async ({ page }) => {
    await page.goto('/he-IL');
    await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
    await page.getByRole('menuitem', { name: he.nav.user.signOut }).click();

    await expect(page).toHaveURL(/\/he-IL\/sign-in/);
    await expect(page.getByRole('heading', { name: he.auth.signIn.title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toHaveCount(0);
  });
});

test.describe('accessibility', () => {
  test('dashboard has no WCAG violations', async ({ page }) => {
    await page.goto('/he-IL');
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('project workspace has no WCAG violations', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
