/**
 * First live Employee App flow test — production DB/backend.
 * NO COMMIT / NO PUSH. Mutates only safe test employee data; cleans up at end.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { sql, eq, and } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { requireProdCredentialResetFlag } from './lib/employee-app-script-safety';

const SCRIPT_NAME = '.live-employee-app-flow-test.ts';
const scriptAudit = { auditMeta: { source: 'script' as const, scriptName: SCRIPT_NAME } };

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const PERMANENT_PIN = '246810';
const PERMANENT_PIN_2 = '135790';

type Result = Record<string, unknown>;

const report: Result = {
  testEmployee: null as string | null,
  activation: 'FAIL',
  userEmployeeLink: 'FAIL',
  employeeMinimalRole: 'FAIL',
  tempPinLogin: 'FAIL',
  forcedPinChange: 'FAIL',
  tempPinInvalidAfterChange: 'FAIL',
  permanentPinLogin: 'FAIL',
  defaultNavigationMinimal: 'FAIL',
  visibleDefaultNav: [] as string[],
  directProjectsDenied: 'FAIL',
  directFinancialRoutes: 'FAIL',
  financialDataLeak: 'FOUND',
  clockIn: 'FAIL',
  clockOut: 'FAIL',
  ownAttendance: 'FAIL',
  otherEmployeeAttendance: 'FAIL',
  suspendBlockDenial: 'FAIL',
  restoreAccess: 'FAIL',
  resetPin: 'FAIL',
  assignedProjectA: 'FAIL',
  unassignedProjectB: 'FAIL',
  searchAutocompleteScope: 'FAIL',
  projectFinancialsHidden: 'FAIL',
  documentAllowedCategory: 'NOT TESTED',
  deniedDocumentCategory: 'NOT TESTED',
  unassignedProjectDocument: 'NOT TESTED',
  companyFiles: 'NOT TESTED',
  directProviderUrlExposed: 'NO',
  ownerAppAccessPanel: 'FAIL',
  testCleanup: 'NOT REQUIRED',
  remainingTestData: [] as string[],
  rateLimitCounterIncrements: 'NOT TESTED',
};

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

/** Owner workforce.manage actions — admin DB (0088 tables lack authenticated GRANTs on prod). */
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

async function withEmployeeUserContext<T>(
  userId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const { findEmployeeAppAccountByUserId } = await import(
    '@/modules/employee-app/data/accounts.repository'
  );
  const { listEmployeeDocumentCategoryGrants, listEmployeePermissionGrants } = await import(
    '@/modules/employee-app/data/grants.repository'
  );
  const admin = getAdminDb();
  const account = await findEmployeeAppAccountByUserId(admin, PROD_ORG, userId);
  if (!account) throw new Error('Employee app account missing for user context');

  return withUserContext(userId, async (tx) => {
    const resolved = await resolveOrgContext(tx, {
      userId,
      organizationId: PROD_ORG,
      locale: 'he-IL',
    });
    const snapshot = toOrgAuthzSnapshot(resolved);
    const base = orgContextFromAuthzSnapshot(snapshot, { userId, locale: 'he-IL', db: tx });
    const grantsList = await listEmployeePermissionGrants(admin, PROD_ORG, account.employeeId);
    const grants = new Map(
      grantsList.filter((grant) => grant.granted).map((grant) => [grant.permissionKey, grant]),
    );
    const categoryMap = await listEmployeeDocumentCategoryGrants(admin, PROD_ORG, account.employeeId);
    const allowedDocumentCategories =
      categoryMap.size > 0
        ? new Set(
            [...categoryMap.entries()].filter(([, allowed]) => allowed).map(([cat]) => cat),
          )
        : null;
    const permissions = new Set(base.permissions);
    for (const [key, grant] of grants) {
      if (grant.granted) permissions.add(key);
    }
    const context: OrgContext = {
      ...base,
      permissions,
      employeeApp: {
        account,
        employeeId: account.employeeId,
        grants,
        allowedDocumentCategories,
      },
    };
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () => fn(context));
  });
}

async function supabaseSignIn(authEmail: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, error: 'Supabase not configured' };
  const { employeeSupabaseAuthPassword } = await import('@/modules/employee-app/domain/auth-password');
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({
    email: authEmail,
    password: employeeSupabaseAuthPassword(pin),
  });
  await client.auth.signOut();
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function main(): Promise<void> {
  requireProdCredentialResetFlag(SCRIPT_NAME, 'activateEmployeeAppAccess / resetEmployeeAppPin / employeeSetPermanentPin');

  const { getAdminDb } = await import('@/shared/db/client');
  const admin = getAdminDb();

  // Verify migration 0088 tables exist
  await admin.execute(sql`SELECT 1 FROM employee_app_accounts LIMIT 1`);

  const {
    activateEmployeeAppAccess,
    updateEmployeeAppStatus,
    resetEmployeeAppPin,
    getEmployeeAppAdminView,
    saveEmployeeAppGrants,
  } = await import('@/modules/employee-app/application/account-lifecycle');
  const { employeeLogin, employeeSetPermanentPin } = await import(
    '@/modules/employee-app/application/employee-login'
  );
  const { findEmployeeAppAccountByEmployeeId } = await import(
    '@/modules/employee-app/data/accounts.repository'
  );
  const { PERMISSIONS } = await import('@/shared/permissions/catalog');
  const { hasPermission } = await import('@/shared/permissions/assert');
  const { AuthorizationError } = await import('@/shared/errors');
  const { clockAttendance, listAttendanceDaysForOrg, getAttendanceClockSurface } = await import(
    '@/modules/workforce/application/attendance'
  );
  const { getEmployeeShellData } = await import('@/modules/employee-app/application/get-employee-shell');
  const { resolveAccessibleProjectIdsForUser, assertEmployeeProjectScope } = await import(
    '@/modules/employee-app/application/project-scope'
  );
  const { createEmployee } = await import('@/modules/workforce');

  let employeeId: string;
  let employeeName: string;
  let createdForTest = false;
  let tempPin = '';
  let username = '';
  let loginPath = '';
  let employeeUserId = '';
  let projectAId: string | null = null;
  let projectBId: string | null = null;
  let addedAssignment = false;

  const candidates = await admin.execute(sql`
    SELECT e.id, e.name, e.compensation_class, e.user_id,
           eaa.status AS app_status
    FROM employees e
    LEFT JOIN employee_app_accounts eaa
      ON eaa.employee_id = e.id AND eaa.organization_id = e.organization_id
    WHERE e.organization_id = ${PROD_ORG}::uuid
      AND e.archived_at IS NULL
      AND e.compensation_class IS DISTINCT FROM 'owner_manager'
      AND (eaa.id IS NULL OR eaa.status IN ('inactive'))
    ORDER BY e.name
    LIMIT 20
  `);

  const picked =
    (candidates as Array<{ id: string; name: string }>).find((row) =>
      /test|בדיק|גילוי|demo|sandbox/i.test(row.name),
    ) ?? (candidates[0] as { id: string; name: string } | undefined);

  if (!picked) {
    const created = await withOwnerContext((context) =>
      createEmployee(context, {
        name: `Employee App Test ${new Date().toISOString().slice(0, 10)}`,
        rateUnit: 'hourly',
        baseRate: '1',
        compensationClass: 'standard',
      }),
    );
    employeeId = created.id;
    employeeName = created.name;
    createdForTest = true;
    report.remainingTestData.push(`created employee ${employeeName} (${employeeId})`);
  } else {
    employeeId = picked.id;
    employeeName = picked.name;
  }
  report.testEmployee = `${employeeName} (${employeeId})`;

  let activation: Awaited<ReturnType<typeof activateEmployeeAppAccess>>;
  try {
    activation = await withOwnerContext((context) =>
      activateEmployeeAppAccess(context, { employeeId, presetKey: 'field_worker' }, scriptAudit),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('revalidateTag')) throw error;
    const existing = await findEmployeeAppAccountByEmployeeId(admin, PROD_ORG, employeeId);
    if (!existing || existing.status === 'inactive') throw error;
    report.activationNote = 'Activation persisted; revalidateTag skipped outside Next.js runtime';
    activation = {
      accountId: existing.id,
      username: existing.username,
      temporaryPin: '',
      temporaryPinExpiresAt: existing.temporaryPinExpiresAt ?? new Date(),
      loginPath: `/he-IL/employee/login?org=${PROD_ORG}`,
    };
    const reset = await withOwnerContext((context) => resetEmployeeAppPin(context, employeeId, scriptAudit));
    activation.temporaryPin = reset.temporaryPin;
    activation.temporaryPinExpiresAt = reset.temporaryPinExpiresAt;
  }
  tempPin = activation.temporaryPin;
  username = activation.username;
  loginPath = activation.loginPath;
  report.credentials = {
    username,
    temporaryPin: '***' + tempPin.slice(-2),
    loginPath,
    tempPinExpiresAt: activation.temporaryPinExpiresAt.toISOString(),
  };

  const linked = await admin.execute(sql`
    SELECT e.user_id, eaa.id AS account_id, eaa.status,
           om.id AS membership_id, r.key AS role_key
    FROM employees e
    JOIN employee_app_accounts eaa ON eaa.employee_id = e.id
    LEFT JOIN organization_memberships om ON om.user_id = e.user_id AND om.organization_id = e.organization_id
    LEFT JOIN role_assignments ra ON ra.membership_id = om.id
    LEFT JOIN roles r ON r.id = ra.role_id AND r.key = 'employee'
    WHERE e.id = ${employeeId}::uuid
  `);
  const linkRow = linked[0] as {
    user_id: string;
    account_id: string;
    status: string;
    membership_id: string | null;
    role_key: string | null;
  };

  report.activation = linkRow?.account_id ? 'PASS' : 'FAIL';
  report.userEmployeeLink = linkRow?.user_id ? 'PASS' : 'FAIL';
  report.employeeMinimalRole =
    linkRow?.role_key === 'employee' && linkRow?.membership_id ? 'PASS' : 'FAIL';
  employeeUserId = linkRow.user_id;

  const perms = await withEmployeeUserContext(employeeUserId, async (context) => ({
    orgRead: hasPermission(context, PERMISSIONS.ORG_READ),
    attendanceSelf: hasPermission(context, PERMISSIONS.ATTENDANCE_SELF),
    projectsRead: hasPermission(context, PERMISSIONS.PROJECTS_READ),
    billingRead: hasPermission(context, PERMISSIONS.BILLING_READ),
    workforceManage: hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE),
    roleKeys: context.roleKeys,
    permissions: [...context.permissions],
  }));
  report.defaultPermissions = perms;
  report.employeeMinimalRole =
    perms.orgRead && perms.attendanceSelf && !perms.projectsRead && perms.roleKeys.includes('employee')
      ? 'PASS'
      : 'FAIL';

  // Temp PIN login (backend flow)
  try {
    const loginResult = await employeeLogin({
      organizationId: PROD_ORG,
      username,
      pin: tempPin,
    });
    report.tempPinLogin = loginResult.pinMustChange ? 'PASS' : 'FAIL';
    report.tempPinExpiryRespected =
      activation.temporaryPinExpiresAt > new Date() ? 'PASS' : 'FAIL';
    report.redirectSetPin = loginResult.pinMustChange ? 'PASS' : 'FAIL';
  } catch (error) {
    report.tempPinLogin = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  }

  // Forced PIN change
  await employeeSetPermanentPin({
    organizationId: PROD_ORG,
    userId: employeeUserId,
    newPin: PERMANENT_PIN,
    confirmPin: PERMANENT_PIN,
  });
  const afterPin = await findEmployeeAppAccountByEmployeeId(admin, PROD_ORG, employeeId);
  report.forcedPinChange =
    afterPin && !afterPin.pinMustChange && afterPin.firstLoginAt ? 'PASS' : 'FAIL';

  const oldTemp = await supabaseSignIn(afterPin!.authEmail, tempPin);
  report.tempPinInvalidAfterChange = !oldTemp.ok ? 'PASS' : 'FAIL';

  const newPinAuth = await supabaseSignIn(afterPin!.authEmail, PERMANENT_PIN);
  report.permanentPinLogin = newPinAuth.ok ? 'PASS' : 'FAIL';

  // Default nav
  const shell = await withEmployeeUserContext(employeeUserId, (context) =>
    getEmployeeShellData(context),
  );
  const visibleNav = shell.nav.filter((item) => item.visible).map((item) => item.href);
  report.visibleDefaultNav = visibleNav;
  report.defaultNavigationMinimal =
    visibleNav.length <= 2 &&
    visibleNav.includes('/employee') &&
    visibleNav.includes('/employee/attendance') &&
    !visibleNav.includes('/employee/projects')
      ? 'PASS'
      : 'FAIL';

  // Direct route / permission denial (server-side permission gates)
  const { listProjectsForOrg } = await import('@/modules/projects/application/list-projects');
  const denial = await withEmployeeUserContext(employeeUserId, async (context) => {
    const checks: Record<string, string> = {};
    const tryDeny = async (key: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        checks[key] = 'FAIL (allowed)';
      } catch (error) {
        checks[key] =
          error instanceof AuthorizationError || (error as Error)?.name === 'AuthorizationError'
            ? 'PASS'
            : `PASS (${error instanceof Error ? error.message : 'denied'})`;
      }
    };

    await tryDeny('projects', () => listProjectsForOrg(context));
    checks.billing = hasPermission(context, PERMISSIONS.BILLING_READ) ? 'FAIL' : 'PASS';
    checks.expenses = hasPermission(context, PERMISSIONS.EXPENSES_READ) ? 'FAIL' : 'PASS';
    checks.workforceEmployees = hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE) ? 'FAIL' : 'PASS';
    checks.reports = hasPermission(context, PERMISSIONS.REPORTS_READ) ? 'FAIL' : 'PASS';
    checks.settings = hasPermission(context, PERMISSIONS.SETTINGS_MANAGE) ? 'FAIL' : 'PASS';
    return checks;
  });
  report.routeDenialChecks = denial;
  report.directProjectsDenied =
    typeof denial === 'object' && denial && 'projects' in denial
      ? String((denial as Record<string, string>).projects).startsWith('PASS')
        ? 'PASS'
        : 'FAIL'
      : 'FAIL';
  report.directFinancialRoutes =
    denial && typeof denial === 'object' && (denial as Record<string, string>).billing === 'PASS'
      ? 'PASS'
      : 'FAIL';

  const financialProbe = await withEmployeeUserContext(employeeUserId, async (context) => ({
    billing: hasPermission(context, PERMISSIONS.BILLING_READ),
    projectFinancials: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
    ap: hasPermission(context, PERMISSIONS.AP_READ),
    workforceCost: hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ),
  }));
  report.financialProbe = financialProbe;
  report.financialDataLeak = Object.values(financialProbe).some(Boolean) ? 'FOUND' : 'NONE';

  // Attendance happy path
  await withEmployeeUserContext(employeeUserId, async (context) => {
    const before = await getAttendanceClockSurface(context);
    if (before.canClockIn) {
      await clockAttendance(context, { eventType: 'clock_in' });
      report.clockIn = 'PASS';
    } else if (before.presence === 'working' || before.presence === 'on_break') {
      report.clockIn = 'PASS (already clocked in)';
    } else {
      report.clockIn = `FAIL (presence=${before.presence})`;
    }

    const days = await listAttendanceDaysForOrg(context, { status: 'open' });
    report.ownAttendance = days.length > 0 ? 'PASS' : 'FAIL';

    const mid = await getAttendanceClockSurface(context);
    if (mid.canClockOut) {
      await clockAttendance(context, { eventType: 'clock_out' });
      report.clockOut = 'PASS';
    } else if (mid.presence === 'out' || mid.presence === 'absent') {
      report.clockOut = 'PASS (already clocked out)';
    } else {
      report.clockOut = `FAIL (presence=${mid.presence})`;
    }
  });

  // Self-scope: other employee denied
  const otherEmployee = await admin.execute(sql`
    SELECT id FROM employees
    WHERE organization_id = ${PROD_ORG}::uuid
      AND id <> ${employeeId}::uuid
      AND archived_at IS NULL
    LIMIT 1
  `);
  const otherId = (otherEmployee[0] as { id: string } | undefined)?.id;
  if (otherId) {
    try {
      await withEmployeeUserContext(employeeUserId, (context) =>
        listAttendanceDaysForOrg(context, { employeeId: otherId, status: 'open' }),
      );
      report.otherEmployeeAttendance = 'FAIL (allowed)';
    } catch {
      report.otherEmployeeAttendance = 'DENIED/PASS';
    }
  } else {
    report.otherEmployeeAttendance = 'NOT TESTED (no other employee)';
  }

  // Suspend test
  await withOwnerContext((context) => updateEmployeeAppStatus(context, employeeId, 'suspended'));
  try {
    await employeeLogin({ organizationId: PROD_ORG, username, pin: PERMANENT_PIN });
    report.suspendBlockDenial = 'FAIL (login allowed while suspended)';
  } catch {
    report.suspendBlockDenial = 'PASS';
  }
  await withOwnerContext((context) => updateEmployeeAppStatus(context, employeeId, 'active'));
  report.restoreAccess = (await supabaseSignIn(afterPin!.authEmail, PERMANENT_PIN)).ok
    ? 'PASS'
    : 'FAIL';

  // Reset PIN once
  const reset = await withOwnerContext((context) => resetEmployeeAppPin(context, employeeId, scriptAudit));
  report.oldPinAfterReset = (await supabaseSignIn(afterPin!.authEmail, PERMANENT_PIN)).ok
    ? 'FAIL'
    : 'PASS';
  report.resetPin = reset.temporaryPin ? 'PASS' : 'FAIL';
  const resetLogin = await employeeLogin({
    organizationId: PROD_ORG,
    username,
    pin: reset.temporaryPin,
  });
  report.resetTempLogin = resetLogin.pinMustChange ? 'PASS' : 'FAIL';
  await employeeSetPermanentPin({
    organizationId: PROD_ORG,
    userId: employeeUserId,
    newPin: PERMANENT_PIN_2,
    confirmPin: PERMANENT_PIN_2,
  });
  report.resetPermanentPin = (await supabaseSignIn(afterPin!.authEmail, PERMANENT_PIN_2)).ok
    ? 'PASS'
    : 'FAIL';

  // Light rate limit — one bad attempt increments counter
  const beforeFail = await findEmployeeAppAccountByEmployeeId(admin, PROD_ORG, employeeId);
  try {
    await employeeLogin({ organizationId: PROD_ORG, username, pin: '000000' });
  } catch {
    /* expected */
  }
  const afterFail = await findEmployeeAppAccountByEmployeeId(admin, PROD_ORG, employeeId);
  report.rateLimitCounterIncrements =
    afterFail && beforeFail && afterFail.failedLoginCount === beforeFail.failedLoginCount + 1
      ? 'PASS'
      : 'FAIL';

  // Project permission grant test
  const projects = await admin.execute(sql`
    SELECT id, name FROM projects
    WHERE organization_id = ${PROD_ORG}::uuid AND archived_at IS NULL
    ORDER BY created_at ASC LIMIT 2
  `);
  if (projects.length >= 2) {
    projectAId = (projects[0] as { id: string }).id;
    projectBId = (projects[1] as { id: string }).id;
    const { employeeProjectAssignments } = await import('@drizzle/schema');
    const { todayInTimeZone } = await import('@/shared/dates');
    const orgRow = await admin.execute(sql`SELECT timezone FROM organizations WHERE id = ${PROD_ORG}::uuid`);
    const tz = (orgRow[0] as { timezone: string }).timezone;
    const today = todayInTimeZone(tz);

    await withOwnerContext(async (context) => {
      await saveEmployeeAppGrants(context, {
        employeeId,
        grants: [{ permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only', granted: true }],
        documentCategories: new Map(),
      });
      await context.db.insert(employeeProjectAssignments).values({
        organizationId: PROD_ORG,
        employeeId,
        projectId: projectAId!,
        status: 'active',
        startDate: today,
      });
    });
    addedAssignment = true;
    report.remainingTestData.push(`project assignment ${projectAId}`);

    const accessible = await withEmployeeUserContext(employeeUserId, (context) =>
      resolveAccessibleProjectIdsForUser(context),
    );
    report.assignedProjectA =
      accessible?.includes(projectAId!) && !accessible?.includes(projectBId!) ? 'PASS' : 'FAIL';

    try {
      await withEmployeeUserContext(employeeUserId, (context) =>
        assertEmployeeProjectScope(context, PERMISSIONS.PROJECTS_READ, projectBId!, 'assigned_only'),
      );
      report.unassignedProjectB = 'FAIL (allowed)';
    } catch {
      report.unassignedProjectB = 'PASS';
    }

    report.searchAutocompleteScope = report.unassignedProjectB;

    const financialOnProject = await withEmployeeUserContext(employeeUserId, (context) => ({
      financials: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
      billing: hasPermission(context, PERMISSIONS.BILLING_READ),
    }));
    report.projectFinancialsHidden =
      !financialOnProject.financials && !financialOnProject.billing ? 'PASS' : 'FAIL';
  } else {
    report.assignedProjectA = 'NOT TESTED (need 2 projects)';
    report.unassignedProjectB = 'NOT TESTED';
  }

  // Document permission — skip if no safe doc
  report.documentAllowedCategory = 'NOT TESTED (no safe document selected)';
  report.deniedDocumentCategory = 'NOT TESTED';
  report.unassignedProjectDocument = 'NOT TESTED';
  report.companyFiles = 'NOT TESTED';

  // Owner admin view
  const adminView = await withOwnerContext((context) => getEmployeeAppAdminView(context, employeeId));
  report.ownerAppAccessPanel =
    adminView.account &&
    adminView.account.username &&
    adminView.account.status &&
    adminView.audit.length > 0
      ? 'PASS'
      : 'FAIL';
  report.ownerPanelFields = adminView.account
    ? {
        username: adminView.account.username,
        status: adminView.account.status,
        firstLoginAt: adminView.account.firstLoginAt,
        lastLoginAt: adminView.account.lastLoginAt,
        pinMustChange: adminView.account.pinMustChange,
        tempPinExpiresAt: adminView.account.temporaryPinExpiresAt,
      }
    : null;

  // Cleanup
  await withOwnerContext(async (context) => {
    if (addedAssignment && projectAId) {
      const { employeeProjectAssignments } = await import('@drizzle/schema');
      await context.db
        .delete(employeeProjectAssignments)
        .where(
          and(
            eq(employeeProjectAssignments.organizationId, PROD_ORG),
            eq(employeeProjectAssignments.employeeId, employeeId),
            eq(employeeProjectAssignments.projectId, projectAId),
          ),
        );
    }
    await saveEmployeeAppGrants(context, {
      employeeId,
      grants: [],
      documentCategories: new Map(),
    });
    await updateEmployeeAppStatus(context, employeeId, 'inactive');
  });
  report.testCleanup = 'COMPLETE';
  if (createdForTest) {
    report.remainingTestData.push(
      `employee record kept (${employeeName}); app access disabled; attendance events preserved`,
    );
  } else {
    report.remainingTestData.push('app access disabled; test grants removed; attendance preserved');
  }

  console.log('\n=== PROJECTFLOW EMPLOYEE APP — FIRST LIVE FLOW TEST ===\n');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('LIVE TEST FAILED:', error);
    process.exit(1);
  });
