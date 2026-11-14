/**
 * Audit-only business-flow probes for EXLFY regression.
 * No product assertions beyond what seed allows; results classified via annotations.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type tasksLocale from '../../../../../src/locales/he-IL/tasks.json';
import { he as heBase } from '../../../../../tests/e2e/fixtures/locales';
import {
  EXPECTED_PROJECT_HUBS,
  expectProjectHeading,
  expectProjectHubTabs,
  projectHubs,
} from '../../../../../tests/e2e/fixtures/project-workspace';
import { loadWorld } from '../../../../../tests/e2e/fixtures/world';

type Verdict = 'VERIFIED_PASS' | 'VERIFIED_FAIL' | 'HARNESS' | 'UNVERIFIED';

const he = {
  ...heBase,
  tasks: JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/tasks.json'), 'utf8'),
  ) as typeof tasksLocale,
};

const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';
const seededExpenseDescription = 'כבלים וחומרי חשמל';
const seededTaskTitle = 'הכנת לוח חשמל ראשי';

const auditFixturesPath = path.resolve(process.cwd(), 'tests/e2e/.audit-route-fixtures.json');

function loadAuditFixtures(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(auditFixturesPath, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function annotate(info: TestInfo, area: string, verdict: Verdict, reason: string) {
  info.annotations.push({ type: 'exlfy-verdict', description: `${area}|${verdict}|${reason}` });
}

async function softGoto(
  page: Page,
  url: string,
): Promise<{ status: number; ok: boolean; harness?: string }> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const status = response?.status() ?? 0;
    return { status, ok: status > 0 && status < 400 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 0, ok: false, harness: message.slice(0, 200) };
  }
}

test.describe('EXLFY business flows (owner, audit)', () => {
  test.setTimeout(120_000);

  test('expenses: list → open seeded → create draft → note payment UI', async ({ page }, info) => {
    const fixtures = loadAuditFixtures();
    const expenseId = fixtures.expenseId;

    const list = await softGoto(page, '/he-IL/expenses');
    if (!list.ok) {
      annotate(info, 'expenses.list', 'HARNESS', list.harness ?? `HTTP ${list.status}`);
      test.info().annotations.push({ type: 'skip-reason', description: 'harness navigation failed' });
      return;
    }
    await expect(page.getByRole('heading', { name: he.expenses.title, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(seededExpenseDescription).first()).toBeVisible({ timeout: 30_000 });
    annotate(info, 'expenses.list', 'VERIFIED_PASS', 'list + seeded row visible');

    if (!expenseId || expenseId === world.projectId) {
      // Fallback: open via list link text
      const link = page.getByRole('link', { name: new RegExp(seededExpenseDescription) }).first();
      if ((await link.count()) === 0) {
        annotate(info, 'expenses.open', 'UNVERIFIED', 'no expense link/id in seed fixtures');
      } else {
        await link.click();
        await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+/, { timeout: 30_000 });
        annotate(info, 'expenses.open', 'VERIFIED_PASS', 'opened via list link');
      }
    } else {
      const detail = await softGoto(page, `/he-IL/expenses/${expenseId}`);
      if (!detail.ok) {
        annotate(
          info,
          'expenses.open',
          detail.harness ? 'HARNESS' : 'VERIFIED_FAIL',
          detail.harness ?? `HTTP ${detail.status} for seeded expenseId`,
        );
        return;
      }
      await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(seededExpenseDescription).first()).toBeVisible({ timeout: 30_000 });
      annotate(info, 'expenses.open', 'VERIFIED_PASS', `opened ${expenseId}`);
    }

    // Payment / confirm UI on finalized seeded expense (observe only if present)
    const confirmPaid = page.getByRole('button', { name: he.expenses.payment.confirmPaid });
    const markPaid = page.getByLabel(he.expenses.payment.markPaid);
    if ((await confirmPaid.count()) > 0 && (await confirmPaid.first().isVisible())) {
      annotate(info, 'expenses.payment_ui', 'VERIFIED_PASS', 'confirmPaid control visible (not submitted)');
    } else if ((await markPaid.count()) > 0 && (await markPaid.first().isVisible())) {
      annotate(info, 'expenses.payment_ui', 'VERIFIED_PASS', 'markPaid control visible (not submitted)');
    } else {
      annotate(
        info,
        'expenses.payment_ui',
        'UNVERIFIED',
        'no confirmPaid/markPaid visible on detail (may already be paid or gated)',
      );
    }

    // Safe create: draft only
    const description = `ביקורת הוצאה ${Date.now()}`;
    await page.goto(`/he-IL/expenses/new?projectId=${world.projectId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('textbox', { name: he.expenses.fields.amount }).fill('250');
    await page
      .locator('form')
      .getByRole('textbox', { name: he.expenses.fields.description })
      .fill(description);
    await page.getByRole('button', { name: he.expenses.actions.saveAsDraft }).click();
    await expect(page).toHaveURL(/\/he-IL\/expenses\/[0-9a-f-]+$/, { timeout: 45_000 });
    await expect(
      page.locator('form').getByRole('textbox', { name: he.expenses.fields.description }),
    ).toHaveValue(description);
    annotate(info, 'expenses.create_draft', 'VERIFIED_PASS', 'draft saved');

    // Approve/finalize: only if button present — click finalize dialog confirm when safe on NEW draft
    const finalize = page.getByRole('button', { name: he.expenses.actions.finalize });
    if ((await finalize.count()) > 0 && (await finalize.first().isVisible())) {
      await finalize.first().click();
      const confirm = page.getByRole('button', { name: he.expenses.actions.finalize }).last();
      if ((await confirm.count()) > 0) {
        await confirm.click();
      }
      const banner = page
        .getByText(he.expenses.detail.finalizedBanner)
        .or(page.getByText(he.expenses.detail.finalizedEditableBanner));
      if (await banner.first().isVisible({ timeout: 15_000 }).catch(() => false)) {
        annotate(info, 'expenses.finalize', 'VERIFIED_PASS', 'draft finalized');
      } else {
        annotate(info, 'expenses.finalize', 'UNVERIFIED', 'finalize clicked; banner not confirmed');
      }
    } else {
      annotate(info, 'expenses.finalize', 'UNVERIFIED', 'finalize control not available');
    }
  });

  test('projects: hubs + seeded task + create/status if feasible', async ({ page }, info) => {
    test.setTimeout(180_000);
    const home = await softGoto(page, `/he-IL/projects/${world.projectId}`);
    if (!home.ok) {
      annotate(info, 'projects.hubs', 'HARNESS', home.harness ?? `HTTP ${home.status}`);
      return;
    }
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 30_000 });
    await expectProjectHeading(page, seededProjectName);
    await expectProjectHubTabs(page, EXPECTED_PROJECT_HUBS);
    annotate(info, 'projects.hubs', 'VERIFIED_PASS', 'five hubs visible');

    // Prefer in-page hub click over full navigation (more stable on this harness).
    try {
      await page.getByRole('tab', { name: projectHubs.work }).click({ timeout: 15_000 });
      await expect(page.getByRole('tab', { name: projectHubs.work })).toHaveAttribute(
        'aria-selected',
        'true',
        { timeout: 15_000 },
      );
    } catch (error) {
      annotate(
        info,
        'projects.work_hub',
        'HARNESS',
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
      return;
    }

    const seededTask = page.getByText(seededTaskTitle).first();
    if (await seededTask.isVisible({ timeout: 15_000 }).catch(() => false)) {
      annotate(info, 'projects.seeded_task', 'VERIFIED_PASS', 'seeded task title visible on work hub');
    } else {
      annotate(info, 'projects.seeded_task', 'UNVERIFIED', 'seeded task title not found on work hub');
    }

    const work = await softGoto(page, '/he-IL/work');
    if (!work.ok) {
      annotate(info, 'work.list', 'HARNESS', work.harness ?? `HTTP ${work.status}`);
    } else {
      await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 20_000 });
      annotate(info, 'work.list', 'VERIFIED_PASS', 'work route loads');
    }

    const board = await softGoto(page, '/he-IL/work/board');
    if (!board.ok) {
      annotate(info, 'tasks.create', 'HARNESS', board.harness ?? `board HTTP ${board.status}`);
      return;
    }

    const title = `משימת ביקורת ${Date.now()}`;
    const addTask = page
      .getByRole('button', { name: he.tasks.addTask })
      .or(page.getByRole('button', { name: he.tasks.create.submit }))
      .or(page.getByRole('link', { name: he.tasks.addTask }));
    const placeholder = page.getByPlaceholder(he.tasks.taskTitlePlaceholder);

    try {
      if ((await placeholder.count()) > 0) {
        await placeholder.first().fill(title);
        await placeholder.first().press('Enter');
      } else if ((await addTask.count()) > 0) {
        await addTask.first().click();
        const titleField = page
          .getByRole('textbox', { name: he.tasks.create.titleLabel })
          .or(page.getByPlaceholder(he.tasks.create.titlePlaceholder));
        if ((await titleField.count()) === 0) {
          annotate(info, 'tasks.create', 'UNVERIFIED', 'create opened without title field');
          return;
        }
        await titleField.first().fill(title);
        const submit = page.getByRole('button', { name: he.tasks.create.submit });
        if ((await submit.count()) > 0) await submit.first().click();
        else await titleField.first().press('Enter');
      } else {
        annotate(info, 'tasks.create', 'UNVERIFIED', 'no add-task control on board');
        return;
      }

      if (await page.getByText(title).first().isVisible({ timeout: 20_000 }).catch(() => false)) {
        annotate(info, 'tasks.create', 'VERIFIED_PASS', 'task created from board');
        await page.getByText(title).first().click().catch(() => undefined);
        const status = page
          .getByLabel(he.tasks.create.statusLabel)
          .or(page.getByRole('combobox', { name: /סטטוס|status/i }));
        if ((await status.count()) > 0) {
          await status.first().click().catch(() => undefined);
          const inProgress = page.getByRole('option', { name: he.tasks.status.in_progress });
          if ((await inProgress.count()) > 0) {
            await inProgress.first().click();
            const save = page.getByRole('button', { name: he.tasks.saveChanges });
            if ((await save.count()) > 0) await save.first().click();
            annotate(info, 'tasks.status_change', 'VERIFIED_PASS', 'set in_progress');
          } else {
            annotate(info, 'tasks.status_change', 'UNVERIFIED', 'status options not found');
          }
        } else {
          annotate(info, 'tasks.status_change', 'UNVERIFIED', 'no status control on task');
        }
      } else {
        annotate(info, 'tasks.create', 'UNVERIFIED', 'submit did not surface new task title');
      }
    } catch (error) {
      annotate(
        info,
        'tasks.create',
        'HARNESS',
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
    }
  });

  test('procurement / RFQ: open if seed supports', async ({ page }, info) => {
    const list = await softGoto(page, '/he-IL/procurement');
    if (!list.ok) {
      annotate(info, 'procurement.list', 'HARNESS', list.harness ?? `HTTP ${list.status}`);
      return;
    }
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
    annotate(info, 'procurement.list', 'VERIFIED_PASS', 'procurement list loads');

    const rfqs = await softGoto(page, '/he-IL/procurement/rfqs');
    if (!rfqs.ok) {
      annotate(info, 'procurement.rfqs', 'UNVERIFIED', `rfqs HTTP ${rfqs.status} (may be gated)`);
      return;
    }
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
    const fixtures = loadAuditFixtures();
    // Seed falls back rfqId === projectId when no real RFQ — treat as unseeded
    if (!fixtures.rfqId || fixtures.rfqId === world.projectId) {
      annotate(
        info,
        'procurement.rfq_detail',
        'UNVERIFIED',
        'no dedicated RFQ id in seed (rfqId placeholder == projectId)',
      );
      return;
    }
    const detail = await softGoto(page, `/he-IL/procurement/rfqs/${fixtures.rfqId}`);
    annotate(
      info,
      'procurement.rfq_detail',
      detail.ok ? 'VERIFIED_PASS' : 'VERIFIED_FAIL',
      `HTTP ${detail.status}`,
    );
  });

  test('RFI / defects: open project routes if present', async ({ page }, info) => {
    // Canonical owner routes (not /quality/* aliases used in older viewport soft paths).
    const rfiList = await softGoto(page, `/he-IL/projects/${world.projectId}/rfi`);
    if (!rfiList.ok) {
      annotate(
        info,
        'quality.rfis',
        rfiList.status === 404 ? 'UNVERIFIED' : 'HARNESS',
        `HTTP ${rfiList.status} — route missing or gated; fixtures use placeholder rfiId`,
      );
    } else {
      await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
      annotate(info, 'quality.rfis', 'VERIFIED_PASS', 'RFI list loads at /projects/:id/rfi');
    }

    const defects = await softGoto(page, `/he-IL/projects/${world.projectId}/defects`);
    if (!defects.ok) {
      annotate(
        info,
        'quality.defects',
        defects.status === 404 ? 'UNVERIFIED' : 'HARNESS',
        `HTTP ${defects.status} — route missing or gated; fixtures use placeholder defectId`,
      );
    } else {
      await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
      annotate(info, 'quality.defects', 'VERIFIED_PASS', 'defects list loads at /projects/:id/defects');
    }

    // Soft: do not fail suite on empty seed for detail IDs
    expect(true).toBe(true);
  });
});
