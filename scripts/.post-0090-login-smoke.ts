/**
 * Post-0090 focused login smoke — production DB + production UI.
 * READ-ONLY by default. Credential mutations require --allow-prod-credential-reset
 * and EMPLOYEE_APP_SMOKE_USERNAME (dedicated test employee only).
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import {
  hasProdCredentialResetFlag,
  requireProdCredentialResetFlag,
  resolveSmokeUsername,
} from './lib/employee-app-script-safety';

const SCRIPT_NAME = '.post-0090-login-smoke.ts';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_BASE = process.env.PROD_SMOKE_BASE_URL ?? 'https://proflow-two-bice.vercel.app';
const PROD_ORG = process.env.PROD_SMOKE_ORG_ID ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

const report: Record<string, unknown> = { mode: 'read-only' };

async function findOwnerUserId(admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>): Promise<string> {
  const rows = await admin.execute(sql`
    SELECT om.user_id
    FROM organization_memberships om
    JOIN role_assignments ra ON ra.membership_id = om.id
    JOIN roles r ON r.id = ra.role_id
    WHERE om.organization_id = ${PROD_ORG}::uuid
      AND om.status = 'active'
      AND r.key = 'owner'
    ORDER BY om.created_at ASC
    LIMIT 1
  `);
  const row = rows[0] as { user_id: string } | undefined;
  if (!row) throw new Error('No owner user found');
  return row.user_id;
}

async function withOwnerContext<T>(fn: (context: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const ownerUserId = await findOwnerUserId(admin);
  const resolved = await resolveOrgContext(admin, {
    userId: ownerUserId,
    organizationId: PROD_ORG,
    locale: 'he-IL',
  });
  const snapshot = toOrgAuthzSnapshot(resolved);
  return runInOrgRequestTxFrame({ tx: admin as never, snapshot }, () =>
    fn(orgContextFromAuthzSnapshot(snapshot, { userId: ownerUserId, locale: 'he-IL', db: admin })),
  );
}

async function checkLoginHtml(path: string, label: string, usernameForPrefill?: string): Promise<void> {
  const res = await fetch(`${PROD_BASE}${path}`);
  const html = await res.text();
  report[`ui_${label}_status`] = res.status;
  report[`ui_${label}_noCompanyField`] =
    !html.includes('name="companyName"') && !html.includes('companyName');
  report[`ui_${label}_hasUsername`] = html.includes('name="username"');
  report[`ui_${label}_hasPin`] = html.includes('name="pin"');
  if (usernameForPrefill && label === 'prefill') {
    report[`ui_${label}_hasPrefillHint`] = html.includes('username');
  }
}

async function runReadOnlySmoke(admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>): Promise<void> {
  const smokeUsername = process.env.EMPLOYEE_APP_SMOKE_USERNAME?.trim();
  if (smokeUsername) {
    const { findEmployeeAppAccountByUsernameGlobal } = await import(
      '@/modules/employee-app/data/accounts.repository'
    );
    const account = await findEmployeeAppAccountByUsernameGlobal(admin, smokeUsername);
    if (account) {
      report.smokeEmployee = account.employeeId;
      report.smokeUsername = account.username;
      report.resolvedOrganizationId = account.organizationId;
      report.orgResolution = account.organizationId === PROD_ORG ? 'PASS' : 'FAIL';
      report.accountStatus = account.status;
      report.pinMustChange = account.pinMustChange;
    } else {
      report.smokeUsernameLookup = 'NOT_FOUND';
    }
  } else {
    report.smokeUsernameLookup = 'SKIPPED (set EMPLOYEE_APP_SMOKE_USERNAME to inspect a test account)';
  }

  await checkLoginHtml('/he-IL/employee/login', 'plain');
  await checkLoginHtml(`/he-IL/employee/login?org=${PROD_ORG}`, 'legacyOrg');
  if (smokeUsername) {
    await checkLoginHtml(`/he-IL/employee/login?u=${encodeURIComponent(smokeUsername)}`, 'prefill', smokeUsername);
    const { buildEmployeeLoginUrl } = await import('@/modules/employee-app/domain/credentials-share');
    const loginUrl = buildEmployeeLoginUrl(PROD_BASE, 'he-IL', smokeUsername);
    report.shareLoginUrl = loginUrl;
    report.shareLoginUrlNoOrg = !loginUrl.includes('org=') ? 'PASS' : 'FAIL';
  }

  const other = await admin.execute(sql`
    SELECT username_normalized, COUNT(DISTINCT organization_id)::int AS orgs
    FROM employee_app_accounts
    GROUP BY username_normalized
    HAVING COUNT(DISTINCT organization_id) > 1
  `);
  report.crossTenantUsernameOverlap = other.length === 0 ? 'PASS' : 'FAIL';
}

async function runCredentialMutationSmoke(
  admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>,
  smokeUsername: string,
): Promise<void> {
  requireProdCredentialResetFlag(SCRIPT_NAME, 'resetEmployeeAppPin / employeeSetPermanentPin');
  report.mode = 'credential-mutation';

  const { findEmployeeAppAccountByUsernameGlobal, findEmployeeAppAccountByEmployeeId } = await import(
    '@/modules/employee-app/data/accounts.repository'
  );
  const { resetEmployeeAppPin } = await import('@/modules/employee-app/application/account-lifecycle');
  const { employeeLogin, employeeSetPermanentPin } = await import(
    '@/modules/employee-app/application/employee-login'
  );
  const { buildEmployeeLoginUrl, buildCredentialsShareMessage } = await import(
    '@/modules/employee-app/domain/credentials-share'
  );

  const account = await findEmployeeAppAccountByUsernameGlobal(admin, smokeUsername);
  if (!account) throw new Error(`Smoke account ${smokeUsername} not found`);

  const scriptAudit = { auditMeta: { source: 'script' as const, scriptName: SCRIPT_NAME } };
  const loginUrl = buildEmployeeLoginUrl(PROD_BASE, 'he-IL', smokeUsername);

  const reset = await withOwnerContext((ctx) =>
    resetEmployeeAppPin(ctx, account.employeeId, scriptAudit),
  );
  report.resetPin = 'PASS';

  try {
    const login = await employeeLogin({ username: smokeUsername, pin: reset.temporaryPin });
    report.usernamePinLogin = login.accountId === account.id ? 'PASS' : 'FAIL';
    report.pinMustChangeAfterReset = login.pinMustChange;

    const testPin = '482910';
    await employeeSetPermanentPin({
      organizationId: account.organizationId,
      userId: account.userId,
      newPin: testPin,
      confirmPin: testPin,
    });
    report.firstLoginPinChange = 'PASS';

    await employeeLogin({ username: smokeUsername, pin: testPin });
    report.permanentPinLogin = 'PASS';

    const after = await findEmployeeAppAccountByEmployeeId(
      admin,
      account.organizationId,
      account.employeeId,
    );
    report.personalPinSet = after?.pinMustChange === false ? 'PASS' : 'FAIL';

    const shareMessage = buildCredentialsShareMessage({
      employeeName: 'Smoke Test',
      organizationName: 'Org',
      username: smokeUsername,
      temporaryPin: '000000',
      temporaryPinExpiresAt: new Date(),
      loginUrl,
    });
    report.shareMessageHasOrgNameOnlyInText =
      shareMessage.includes('Org') && !shareMessage.includes('org=') ? 'PASS' : 'FAIL';
    report.shareMessageNoCompanyPrompt =
      !shareMessage.includes('שם החברה') && !shareMessage.includes('company') ? 'PASS' : 'FAIL';

    await withOwnerContext((ctx) => resetEmployeeAppPin(ctx, account.employeeId, scriptAudit));
    report.resetPinAfterTest = 'PASS';
  } catch (error) {
    report.loginFlowError = error instanceof Error ? error.message : String(error);
    report.usernamePinLogin = 'FAIL';
  }
}

async function main(): Promise<void> {
  const { getAdminDb } = await import('@/shared/db/client');
  const admin = getAdminDb();

  await runReadOnlySmoke(admin);

  if (hasProdCredentialResetFlag()) {
    const smokeUsername = resolveSmokeUsername();
    await runCredentialMutationSmoke(admin, smokeUsername);
  } else {
    report.credentialMutation = 'SKIPPED (pass --allow-prod-credential-reset for login flow checks)';
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
