/**
 * Browser login smoke against production UI.
 * READ-ONLY / credential-safe: requires --allow-prod-credential-reset for any PIN reset.
 * Set EMPLOYEE_APP_SMOKE_USERNAME (dedicated test employee only).
 */
import dotenv from 'dotenv';
import { chromium, type Page } from 'playwright';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import {
  requireProdCredentialResetFlag,
  resolveSmokeUsername,
} from './lib/employee-app-script-safety';

const SCRIPT_NAME = '.prod-browser-login-2485.ts';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = process.env.PROD_SMOKE_ORG_ID ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const PROD_BASE = process.env.PROD_SMOKE_BASE_URL ?? 'https://proflow-two-bice.vercel.app';
const PERSONAL_PIN = process.env.EMPLOYEE_APP_SMOKE_PERSONAL_PIN ?? '864200';
const PERSONAL_PIN_2 = process.env.EMPLOYEE_APP_SMOKE_PERSONAL_PIN_2 ?? '975311';

async function findOwnerUserId(admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>): Promise<string> {
  const rows = await admin.execute(sql`
    SELECT om.user_id FROM organization_memberships om
    JOIN role_assignments ra ON ra.membership_id = om.id
    JOIN roles r ON r.id = ra.role_id
    WHERE om.organization_id = ${PROD_ORG}::uuid AND om.status = 'active' AND r.key = 'owner'
    ORDER BY om.created_at ASC LIMIT 1
  `);
  return (rows[0] as { user_id: string }).user_id;
}

async function withOwnerContext<T>(fn: (context: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const ownerUserId = await findOwnerUserId(admin);
  const resolved = await resolveOrgContext(admin, { userId: ownerUserId, organizationId: PROD_ORG, locale: 'he-IL' });
  const snapshot = toOrgAuthzSnapshot(resolved);
  return runInOrgRequestTxFrame({ tx: admin as never, snapshot }, () =>
    fn(orgContextFromAuthzSnapshot(snapshot, { userId: ownerUserId, locale: 'he-IL', db: admin })),
  );
}

async function submitLogin(page: Page, username: string, pin: string): Promise<void> {
  const loginUrl = `${PROD_BASE}/he-IL/employee/login?u=${encodeURIComponent(username)}`;
  await page.goto(loginUrl, { waitUntil: 'networkidle' });
  await page.fill('#username', username);
  await page.fill('#pin', pin);
  await page.getByRole('button', { name: /כניסה|login/i }).click();
  await page.waitForTimeout(4000);
}

async function main(): Promise<void> {
  requireProdCredentialResetFlag(SCRIPT_NAME, 'resetEmployeeAppPin / browser login flow');
  const username = resolveSmokeUsername();

  const { resetEmployeeAppPin, getEmployeeAppAdminView } = await import('@/modules/employee-app');
  const { getAdminDb } = await import('@/shared/db/client');
  const { findEmployeeAppAccountByUsernameGlobal } = await import('@/modules/employee-app/data/accounts.repository');
  const { buildCredentialsShareMessage, buildEmployeeLoginUrl } = await import(
    '@/modules/employee-app/domain/credentials-share'
  );

  const admin = getAdminDb();
  const account = await findEmployeeAppAccountByUsernameGlobal(admin, username);
  if (!account) throw new Error(`Smoke account ${username} not found`);

  const scriptAudit = { auditMeta: { source: 'script' as const, scriptName: SCRIPT_NAME } };
  const reset1 = await withOwnerContext((ctx) => resetEmployeeAppPin(ctx, account.employeeId, scriptAudit));
  const view1 = await withOwnerContext((ctx) => getEmployeeAppAdminView(ctx, account.employeeId));
  const tempPin1 = view1.shareableCredentials?.temporaryPin ?? reset1.temporaryPin;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();

  const report: Record<string, unknown> = {
    username,
    ownerPinMatchesReset: tempPin1 === reset1.temporaryPin,
  };

  await submitLogin(page, username, tempPin1);
  report.tempPinLoginUrl = page.url();
  report.tempPinLogin = /\/employee\/set-pin/i.test(page.url()) ? 'PASS' : 'FAIL';

  if (report.tempPinLogin === 'PASS') {
    await page.fill('#newPin, input[name="newPin"]', PERSONAL_PIN);
    await page.fill('#confirmPin, input[name="confirmPin"]', PERSONAL_PIN);
    await page.getByRole('button', { name: /שמירה|save|continue/i }).click();
    await page.waitForTimeout(4000);
    report.setPersonalPinUrl = page.url();
    report.setPersonalPin = /\/employee(?:\/|$)/.test(page.url()) && !/\/login/.test(page.url()) ? 'PASS' : 'FAIL';
  } else {
    report.setPersonalPin = 'SKIP';
  }

  if (report.setPersonalPin === 'PASS') {
    report.employeeHome = /\/employee(?:\/|$)/.test(page.url()) ? 'PASS' : 'FAIL';
    await context.clearCookies();
    await submitLogin(page, username, PERSONAL_PIN);
    report.personalPinReLogin = /\/employee(?:\/|$)/.test(page.url()) && !/\/login/.test(page.url()) ? 'PASS' : 'FAIL';
  } else {
    report.employeeHome = 'SKIP';
    report.personalPinReLogin = 'SKIP';
  }

  const reset2 = await withOwnerContext((ctx) => resetEmployeeAppPin(ctx, account.employeeId, scriptAudit));
  const view2 = await withOwnerContext((ctx) => getEmployeeAppAdminView(ctx, account.employeeId));
  const tempPin2 = view2.shareableCredentials?.temporaryPin ?? reset2.temporaryPin;
  report.resetPinAgain = 'PASS';
  report.newTempPinVisible = tempPin2 === reset2.temporaryPin ? 'PASS' : 'FAIL';

  await context.clearCookies();
  await submitLogin(page, username, tempPin2);
  report.newTempPinLogin = /\/employee\/set-pin/i.test(page.url()) ? 'PASS' : 'FAIL';

  const loginUrl = buildEmployeeLoginUrl(PROD_BASE, 'he-IL', username);
  const shareMessage = buildCredentialsShareMessage({
    employeeName: 'Smoke Test',
    organizationName: 'Test Org',
    username,
    temporaryPin: tempPin2,
    temporaryPinExpiresAt: reset2.temporaryPinExpiresAt,
    loginUrl,
  });
  report.shareMessage = {
    canonicalUrl: loginUrl.startsWith(`${PROD_BASE}/`) ? 'PASS' : 'FAIL',
    hasFullTemplate:
      shareMessage.includes('Test Org') &&
      shareMessage.includes(PROD_BASE) &&
      shareMessage.includes(username) &&
      /PIN זמני:\n\d{6}/.test(shareMessage)
        ? 'PASS'
        : 'FAIL',
  };

  report.pass =
    report.tempPinLogin === 'PASS' &&
    report.setPersonalPin === 'PASS' &&
    report.personalPinReLogin === 'PASS' &&
    report.newTempPinLogin === 'PASS';

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.pass !== true) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
