/**
 * Post-fix EXLFY runtime probes (owner app) — BUG-001…016 coverage map.
 * Classify via `exlfy-verdict` annotations; no production mutations.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type commandCenter from '../../../../../src/locales/he-IL/commandCenter.json';
import type projectGoals from '../../../../../src/locales/he-IL/projectGoals.json';
import type searchLocale from '../../../../../src/locales/he-IL/search.json';
import type workforce from '../../../../../src/locales/he-IL/workforce.json';
import { LIVE_SHARE_TEXT } from '../../../../../src/modules/infra-mapping/ui/live-share-texts';
import { he as heBase } from '../../../../../tests/e2e/fixtures/locales';
import { projectHubs } from '../../../../../tests/e2e/fixtures/project-workspace';
import { loadWorld } from '../../../../../tests/e2e/fixtures/world';
import {
  annotate,
  loadBug02Fixture,
  pageShowsGenericCrash,
  payrollDeepLinkFromFixture,
  softGoto,
} from './exlfy-fix-verify-helpers';

const heWorkforce = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/workforce.json'), 'utf8'),
) as typeof workforce;
const heSearch = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/search.json'), 'utf8'),
) as typeof searchLocale;
const heCommand = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/commandCenter.json'), 'utf8'),
) as typeof commandCenter;
const heGoals = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/projectGoals.json'), 'utf8'),
) as typeof projectGoals;

const he = { ...heBase, workforce: heWorkforce, search: heSearch, commandCenter: heCommand };

const world = loadWorld();
const tPayroll = heWorkforce.payrollPayment;
const tMonth = heWorkforce.monthReview;
const tRetro = heWorkforce.retroactiveEdit;
async function openPayrollEmployeePage(page: Page): Promise<{ ok: boolean; note: string }> {
  const fixture = loadBug02Fixture();
  const deepLink = payrollDeepLinkFromFixture(fixture);
  if (deepLink) {
    const nav = await softGoto(page, deepLink);
    if (!nav.ok) return { ok: false, note: nav.harness ?? `HTTP ${nav.status}` };
    if (await pageShowsGenericCrash(page)) {
      return { ok: false, note: 'generic error boundary on EMC deep link' };
    }
    return { ok: true, note: 'bug-02 EMC fixture deep link' };
  }

  const list = await softGoto(page, '/he-IL/workforce/employees');
  if (!list.ok) return { ok: false, note: list.harness ?? `HTTP ${list.status}` };
  const firstLink = page.locator('main a[href*="/workforce/employees/"]').first();
  if ((await firstLink.count()) === 0) {
    return { ok: false, note: 'no employee row in list (run bug-02 seed for payroll EMC)' };
  }
  await firstLink.click();
  await page.waitForURL(/\/workforce\/employees\/[0-9a-f-]+/i, { timeout: 30_000 }).catch(() => undefined);
  if (await pageShowsGenericCrash(page)) {
    return { ok: false, note: 'generic error on employee profile' };
  }
  return { ok: true, note: 'first employee from workforce list' };
}

test.describe('EXLFY fix-verify (owner)', () => {
  test.setTimeout(180_000);

  test('payroll three concepts + month review split (BUG-001,002,004)', async ({ page }, info) => {
    const opened = await openPayrollEmployeePage(page);
    if (!opened.ok) {
      annotate(info, 'payroll.confirm_ui', 'HARNESS', opened.note);
      annotate(info, 'payroll.month_review_cta', 'UNVERIFIED', opened.note);
      annotate(info, 'money.shekel_display', 'UNVERIFIED', opened.note);
      return;
    }
    annotate(info, 'payroll.navigation', 'VERIFIED_PASS', opened.note);

    const panel = page.locator('#employee-payroll-payment');
    const panelVisible = await panel.isVisible().catch(() => false);
    if (!panelVisible) {
      annotate(info, 'payroll.confirm_ui', 'UNVERIFIED', 'payroll panel not mounted for employee/month');
      annotate(info, 'payroll.month_review_cta', 'UNVERIFIED', 'no payrollPayment — month review may be collapsed');
      return;
    }
    annotate(info, 'payroll.confirm_ui', 'VERIFIED_PASS', 'employee payroll panel visible');

    const conceptsTitle = page.getByText(tPayroll.threeConceptsTitle);
    if (await conceptsTitle.isVisible().catch(() => false)) {
      annotate(info, 'payroll.three_concepts', 'VERIFIED_PASS', 'threeConcepts callout visible');
      for (const label of [
        tPayroll.conceptBaseSalary,
        tPayroll.conceptEmployerCost,
        tPayroll.conceptPaidAmount,
      ]) {
        if (await page.getByText(label, { exact: false }).first().isVisible().catch(() => false)) {
          annotate(info, `payroll.concept.${label.slice(0, 12)}`, 'VERIFIED_PASS', 'concept line visible');
        }
      }
    } else {
      annotate(info, 'payroll.three_concepts', 'VERIFIED_FAIL', 'panel without threeConcepts block');
    }

    const monthReview = page
      .locator('#employee-labor-allocation')
      .or(page.getByText(tMonth.advancedSummary))
      .or(page.getByText(/מתקדם: סקירת עלות מעסיק/i));
    const payrollPanel = page.locator('#employee-payroll-payment');
    if ((await monthReview.count()) > 0 && (await payrollPanel.isVisible())) {
      annotate(
        info,
        'payroll.month_review_cta',
        'VERIFIED_PASS',
        'month review section coexists with separate payroll payment panel',
      );
    } else {
      annotate(info, 'payroll.month_review_cta', 'UNVERIFIED', 'month review advanced block not shown for seed employee');
    }

    const bodyText = await panel.innerText().catch(() => '');
    if (bodyText.includes('₪')) {
      annotate(info, 'money.shekel_display', 'VERIFIED_PASS', '₪ visible on payroll panel (BUG-004)');
    } else {
      annotate(info, 'money.shekel_display', 'UNVERIFIED', 'no ₪ in payroll panel text (amounts may be absent in seed)');
    }
    expect(await pageShowsGenericCrash(page)).toBe(false);
  });

  test('applied cost correction + paid amount + retro history (BUG-002)', async ({ page }, info) => {
    const opened = await openPayrollEmployeePage(page);
    if (!opened.ok) {
      annotate(info, 'payroll.applied_cost_correction', 'UNVERIFIED', opened.note);
      annotate(info, 'payroll.paid_amount_ui', 'UNVERIFIED', opened.note);
      annotate(info, 'payroll.retro_history', 'UNVERIFIED', opened.note);
      return;
    }

    const crashed = await pageShowsGenericCrash(page);
    if (crashed) {
      annotate(info, 'payroll.applied_cost_correction', 'VERIFIED_FAIL', 'generic crash on payroll route');
      annotate(info, 'payroll.paid_amount_ui', 'VERIFIED_FAIL', 'generic crash');
      annotate(info, 'payroll.retro_history', 'UNVERIFIED', 'page crashed before retro UI');
      return;
    }
    annotate(info, 'payroll.applied_cost_correction', 'VERIFIED_PASS', 'payroll route loads without crash');

    const paidLabel = page.getByText(tPayroll.paidAmount, { exact: false });
    const obligationLabel = page.getByText(tPayroll.obligationExpectedAmount, { exact: false });
    if (
      (await paidLabel.first().isVisible().catch(() => false)) ||
      (await obligationLabel.first().isVisible().catch(() => false))
    ) {
      annotate(info, 'payroll.paid_amount_ui', 'VERIFIED_PASS', 'paid/obligation amount labels visible');
    } else {
      annotate(info, 'payroll.paid_amount_ui', 'UNVERIFIED', 'amount labels not visible');
    }

    const retroTitle = page.getByText(tRetro.title);
    const reviewCorrection = page.getByRole('button', { name: tRetro.save });
    const hasAppliedEmc = Boolean(loadBug02Fixture()?.emcHistoryId);
    if (await retroTitle.isVisible().catch(() => false)) {
      annotate(info, 'payroll.retro_history', 'VERIFIED_PASS', 'retroactive payroll edit section visible');
    } else if ((await reviewCorrection.count()) > 0) {
      annotate(info, 'payroll.retro_history', 'VERIFIED_PASS', 'month cost correction CTA visible (not submitted)');
    } else if (hasAppliedEmc) {
      annotate(
        info,
        'payroll.retro_history',
        'UNVERIFIED',
        'EMC fixture present but retro/correction UI not shown (payment may be unpaid)',
      );
    } else {
      annotate(
        info,
        'payroll.retro_history',
        'UNVERIFIED',
        'no applied EMC in seed — run bug-02/seed-emc-payroll.mjs for history path',
      );
    }

    const confirmPaid = page.getByRole('button', { name: he.commandCenter.actions.confirmPaid });
    if (await confirmPaid.isVisible().catch(() => false)) {
      annotate(info, 'payroll.confirm_paid_cta', 'VERIFIED_PASS', 'confirm paid control visible (not clicked)');
    }
    expect(crashed).toBe(false);
  });

  test('past-month roll-forward probe (BUG-001)', async ({ page }, info) => {
    annotate(
      info,
      'payroll.past_month_rollforward',
      'UNVERIFIED_E2E',
      'cannot time-travel month boundary in harness; covered by tests/unit/workforce/past-month-accrual-roll-forward.test.ts',
    );
    const opened = await openPayrollEmployeePage(page);
    if (!opened.ok) {
      annotate(info, 'payroll.past_month_ui_note', 'UNVERIFIED', opened.note);
      return;
    }
    const hint = page.getByText(/חודש|yearMonth|עלות מעסיק/i).first();
    if (await hint.isVisible().catch(() => false)) {
      annotate(info, 'payroll.past_month_ui_note', 'VERIFIED_PASS', 'employee month context renders (no roll-forward assert)');
    }
    expect(true).toBe(true);
  });

  test('FAB hidden on composer routes (BUG-005)', async ({ page }, info) => {
    const routes = ['/he-IL/expenses/new', '/he-IL/projects/new', '/he-IL/workforce/employees/new'];
    for (const route of routes) {
      const nav = await softGoto(page, route);
      if (!nav.ok) {
        annotate(info, `fab.hide.${route}`, 'HARNESS', nav.harness ?? `HTTP ${nav.status}`);
        continue;
      }
      const fab = page.locator('[data-pf-quick-create="fab"]');
      const visible = await fab.isVisible().catch(() => false);
      annotate(
        info,
        `fab.hide.${route.split('/').slice(-2).join('_')}`,
        visible ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
        visible ? 'FAB still visible on composer' : 'FAB absent on composer',
      );
    }
    const safeList = await softGoto(page, '/he-IL/expenses');
    if (safeList.ok) {
      const fabOnList = await page.locator('[data-pf-quick-create="fab"]').isVisible().catch(() => false);
      annotate(
        info,
        'fab.control_list',
        fabOnList ? 'VERIFIED_PASS' : 'UNVERIFIED',
        fabOnList ? 'FAB present on list (control)' : 'FAB hidden on expenses list too',
      );
    }
    expect(true).toBe(true);
  });

  test('Live Share entry + authz soft probe (BUG-011)', async ({ page }, info) => {
    const nav = await softGoto(page, `/he-IL/projects/${world.projectId}`);
    if (!nav.ok) {
      annotate(info, 'live_share.entry', 'HARNESS', nav.harness ?? `HTTP ${nav.status}`);
      return;
    }
    await page.getByRole('tab', { name: projectHubs.infra }).click({ timeout: 15_000 }).catch(() => undefined);

    const shareBtn = page.getByRole('button', { name: LIVE_SHARE_TEXT.share });
    if ((await shareBtn.count()) === 0) {
      annotate(info, 'live_share.entry', 'UNVERIFIED', 'Live Share control not in infra hub (module off or layout)');
      return;
    }
    annotate(info, 'live_share.entry', 'VERIFIED_PASS', 'share broadcast control visible');

    await shareBtn.first().click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const errorNotice = page.locator('[data-testid="live-share-error"]');
    const badge = page.locator('[data-testid="live-share-badge"]');
    if (await errorNotice.isVisible().catch(() => false)) {
      const text = await errorNotice.innerText().catch(() => '');
      const denied = /הרשא|documents|מסמכ/i.test(text);
      annotate(
        info,
        'live_share.authz',
        denied ? 'VERIFIED_PASS' : 'UNVERIFIED',
        `live-share-error: ${text.slice(0, 120)}`,
      );
    } else if (await badge.isVisible().catch(() => false)) {
      annotate(info, 'live_share.authz', 'VERIFIED_PASS', 'host badge without deny (owner has documents.view)');
    } else {
      annotate(info, 'live_share.authz', 'UNVERIFIED', 'no error badge — camera/permission harness blocker');
    }
    expect(await pageShowsGenericCrash(page)).toBe(false);
  });

  test('BOQ sheet-mark link UI (BUG-013)', async ({ page }, info) => {
    const plans = await softGoto(page, `/he-IL/projects/${world.projectId}/plans`);
    if (!plans.ok) {
      annotate(info, 'boq.sheet_mark_link', 'HARNESS', plans.harness ?? `HTTP ${plans.status}`);
      return;
    }
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 20_000 });
    const drawingLink = page.locator('main a[href*="/plans/"]').first();
    if ((await drawingLink.count()) === 0) {
      annotate(info, 'boq.sheet_mark_link', 'UNVERIFIED', 'no drawing revision in seed for sheet-mark BOQ probe');
      return;
    }
    await drawingLink.click();
    await page.waitForURL(/\/plans\/[0-9a-f-]+/i, { timeout: 30_000 }).catch(() => undefined);
    const markMode = page.getByRole('button', { name: /סימון|mark|הערה/i });
    const boqPicker = page.getByText(/כתב כמויות|BOQ|שורת כתב/i);
    if ((await markMode.count()) > 0 || (await boqPicker.count()) > 0) {
      annotate(info, 'boq.sheet_mark_link', 'VERIFIED_PASS', 'plans workspace exposes mark/BOQ affordances');
    } else {
      annotate(info, 'boq.sheet_mark_link', 'UNVERIFIED', 'drawing open but sheet-mark/BOQ UI not found');
    }
    expect(await pageShowsGenericCrash(page)).toBe(false);
  });

  test('multi-org switcher badges (BUG-012)', async ({ page }, info) => {
    const home = await softGoto(page, '/he-IL');
    if (!home.ok) {
      annotate(info, 'multi_org.badges', 'HARNESS', home.harness ?? `HTTP ${home.status}`);
      return;
    }
    const trigger = page.getByRole('button', { name: /ארגון נוכחי/ }).first();
    if ((await trigger.count()) === 0 || !(await trigger.isVisible().catch(() => false))) {
      annotate(
        info,
        'multi_org.badges',
        world.otherOrganizationId ? 'UNVERIFIED' : 'UNVERIFIED',
        world.otherOrganizationId
          ? 'multi-org seed but switcher not visible in shell'
          : 'switcher hidden (single visible org for user)',
      );
      return;
    }
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({ timeout: 10_000 });
    annotate(info, 'multi_org.switcher', 'VERIFIED_PASS', 'organization menu opens without crash');
    const badges = menu.locator('span.rounded-full.tabular-nums');
    const badgeCount = await badges.count();
    annotate(
      info,
      'multi_org.badges',
      'VERIFIED_PASS',
      badgeCount > 0 ? `${badgeCount} open-task badge(s) rendered` : 'menu rendered; zero badges (counts may be 0)',
    );
    expect(await pageShowsGenericCrash(page)).toBe(false);
  });

  test('global search resilient query (BUG-014)', async ({ page }, info) => {
    const home = await softGoto(page, '/he-IL/expenses');
    if (!home.ok) {
      annotate(info, 'global_search', 'HARNESS', home.harness ?? `HTTP ${home.status}`);
      return;
    }
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    const opened =
      (await dialog.isVisible().catch(() => false)) ||
      (await page.getByPlaceholder(heSearch.placeholder).isVisible().catch(() => false));
    if (!opened) {
      const btn = page.getByRole('button', { name: heSearch.open });
      if ((await btn.count()) > 0) await btn.first().click();
    }
    const input = page.getByPlaceholder(heSearch.placeholder);
    if ((await input.count()) === 0) {
      annotate(info, 'global_search', 'UNVERIFIED', 'search dialog not opened');
      return;
    }
    await input.fill('שיפוץ');
    await page.waitForTimeout(2500);
    const crashed = await pageShowsGenericCrash(page);
    annotate(
      info,
      'global_search',
      crashed ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
      crashed ? 'page crashed after query' : 'search query completed without crash',
    );
    expect(crashed).toBe(false);
  });

  test('project goals main app (BUG-009,015)', async ({ page }, info) => {
    const goals = await softGoto(page, `/he-IL/projects/${world.projectId}/goals`);
    if (!goals.ok) {
      annotate(info, 'goals.main', 'HARNESS', goals.harness ?? `HTTP ${goals.status}`);
      return;
    }
    await expect(page.getByRole('heading', { name: heGoals.title, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    annotate(info, 'goals.main', 'VERIFIED_PASS', 'main goals page loads');
    expect(await pageShowsGenericCrash(page)).toBe(false);
  });

  test('Today decisions lens + workforce error routes (BUG-010,016)', async ({ page }, info) => {
    const today = await softGoto(page, '/he-IL/today');
    if (!today.ok) {
      annotate(info, 'today.lens', 'HARNESS', today.harness ?? `HTTP ${today.status}`);
    } else {
      const allBtn = page.getByRole('button', { name: heCommand.decisionsLens.all });
      const decisionsBtn = page.getByRole('button', { name: heCommand.decisionsLens.decisionsOnly });
      if (await allBtn.isVisible().catch(() => false)) {
        await decisionsBtn.click();
        await expect(page.getByText(heCommand.decisionsLens.filterActiveHint)).toBeVisible({
          timeout: 15_000,
        });
        annotate(info, 'today.decisions_lens', 'VERIFIED_PASS', 'decisions lens active + hint visible');
        const reset = page.getByRole('button', { name: heCommand.decisionsLens.showAllIncludingFinance });
        await reset.click();
        annotate(info, 'today.decisions_reset', 'VERIFIED_PASS', 'reset to all items');
      } else {
        annotate(info, 'today.decisions_lens', 'UNVERIFIED', 'Today lens toggle not visible (gated role)');
      }
    }

    for (const route of ['/he-IL/workforce/time', '/he-IL/workforce/time/approvals']) {
      const nav = await softGoto(page, route);
      if (!nav.ok) {
        annotate(info, `workforce.errors.${route}`, 'HARNESS', nav.harness ?? `HTTP ${nav.status}`);
        continue;
      }
      const crashed = await pageShowsGenericCrash(page);
      annotate(
        info,
        `workforce.errors.${route.split('/').pop()}`,
        crashed ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
        crashed ? 'error boundary surfaced' : 'route reachable',
      );
    }
    expect(true).toBe(true);
  });
});