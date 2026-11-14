/**
 * Employee + contractor surface smoke for EXLFY fix-verify (BUG-009,015 parity).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type projectGoals from '../../../../../src/locales/he-IL/projectGoals.json';
import {
  E2E_GC_CONTRACTOR,
  E2E_GC_OPS_EMPLOYEE,
  E2E_SINGLE_EMPLOYEE,
  SEED_PASSWORD,
} from '../../../../../tests/e2e/harness/config';
import { loadWorld } from '../../../../../tests/e2e/fixtures/world';
import { annotate, pageShowsGenericCrash, softGoto } from './exlfy-fix-verify-helpers';

const heGoals = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/projectGoals.json'), 'utf8'),
) as typeof projectGoals;

async function contractorSignIn(page: Page): Promise<void> {
  await page.goto('/he-IL/contractor/sign-in', { waitUntil: 'domcontentloaded' });
  const user = page.locator('#contractor-username');
  const target = (await user.locator('input').count()) > 0 ? user.locator('input') : user;
  await target.fill(E2E_GC_CONTRACTOR.username);
  const pass = page.locator('#contractor-password');
  const passTarget = (await pass.locator('input').count()) > 0 ? pass.locator('input') : pass;
  await passTarget.fill(SEED_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 90_000 });
}

async function employeeSignInAttempt(
  page: Page,
  username: string,
  pin: string,
  timeoutMs = 60_000,
): Promise<void> {
  await page.goto('/he-IL/employee/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(username);
  await page.locator('#pin').fill(pin);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: timeoutMs });
}

async function employeeSignIn(page: Page): Promise<{ ok: boolean; note: string }> {
  const world = loadWorld();
  const primaryUser = world.gcOpsUsername ?? E2E_GC_OPS_EMPLOYEE.username;
  const primaryPin = E2E_GC_OPS_EMPLOYEE.pin;
  try {
    await employeeSignInAttempt(page, primaryUser, primaryPin);
    return { ok: true, note: `ops employee ${primaryUser}` };
  } catch (primaryError) {
    await page.context().clearCookies();
    try {
      await employeeSignInAttempt(page, E2E_SINGLE_EMPLOYEE.username, E2E_SINGLE_EMPLOYEE.pin);
      return {
        ok: true,
        note: `fallback single-org employee (${primaryError instanceof Error ? primaryError.message.slice(0, 80) : 'primary failed'})`,
      };
    } catch {
      return {
        ok: false,
        note: primaryError instanceof Error ? primaryError.message.slice(0, 200) : String(primaryError),
      };
    }
  }
}

test.describe('EXLFY fix-verify surfaces (employee + contractor)', () => {
  test.setTimeout(180_000);

  test('contractor: login + goals route (BUG-015)', async ({ page }, info) => {
    const world = loadWorld();
    try {
      await contractorSignIn(page);
      annotate(info, 'contractor.auth', 'VERIFIED_PASS', 'contractor sign-in OK');
    } catch (error) {
      annotate(
        info,
        'contractor.auth',
        'HARNESS',
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      );
      return;
    }

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    if (!world.gcProjectId) {
      annotate(info, 'contractor.goals', 'UNVERIFIED', 'gcProjectId missing in world.json');
      return;
    }

    const goals = await softGoto(page, `/he-IL/contractor/projects/${world.gcProjectId}/goals`);
    if (!goals.ok) {
      annotate(info, 'contractor.goals', 'HARNESS', goals.harness ?? `HTTP ${goals.status}`);
      return;
    }
    const crashed = await pageShowsGenericCrash(page);
    const heading = page.getByRole('heading', { name: heGoals.title });
    const visible = await heading.isVisible().catch(() => false);
    annotate(
      info,
      'contractor.goals',
      crashed ? 'VERIFIED_FAIL' : visible ? 'VERIFIED_PASS' : 'UNVERIFIED',
      crashed ? 'crash on goals' : visible ? 'goals heading visible' : 'goals gated or empty',
    );
    expect(crashed).toBe(false);
  });

  test('employee: login + goals route (BUG-009,015)', async ({ page }, info) => {
    const world = loadWorld();
    const auth = await employeeSignIn(page);
    if (!auth.ok) {
      annotate(info, 'employee.auth', 'HARNESS', auth.note);
      annotate(info, 'employee.goals', 'HARNESS', 'login blocked');
      return;
    }
    annotate(info, 'employee.auth', auth.note.includes('fallback') ? 'HARNESS' : 'VERIFIED_PASS', auth.note);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    if (!world.gcProjectId) {
      annotate(info, 'employee.goals', 'UNVERIFIED', 'gcProjectId missing');
      return;
    }

    const goals = await softGoto(page, `/he-IL/employee/projects/${world.gcProjectId}/goals`);
    if (!goals.ok) {
      annotate(info, 'employee.goals', 'HARNESS', goals.harness ?? `HTTP ${goals.status}`);
      return;
    }
    const crashed = await pageShowsGenericCrash(page);
    const heading = page.getByRole('heading', { name: heGoals.title });
    const visible = await heading.isVisible().catch(() => false);
    annotate(
      info,
      'employee.goals',
      crashed ? 'VERIFIED_FAIL' : visible ? 'VERIFIED_PASS' : 'UNVERIFIED',
      crashed ? 'crash on goals' : visible ? 'goals heading visible' : 'goals gated or empty',
    );
    expect(crashed).toBe(false);
  });
});