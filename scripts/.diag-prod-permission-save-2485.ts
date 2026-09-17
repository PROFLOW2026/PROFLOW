/**
 * Reproduce Owner permission save using production DB (EMPLOYEE_APP_SMOKE_USERNAME).
 * with authenticated RLS (same path as saveEmployeeAppGrantsEditorAction).
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { resolveSmokeUsername } from './lib/employee-app-script-safety';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = process.env.PROD_SMOKE_ORG_ID ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

async function findOwnerUserId(
  admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>,
): Promise<string> {
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

function errorSummary(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return {
      name: e.name,
      message: e.message,
      code: e.code,
      detail: e.detail,
      hint: e.hint,
      constraint: e.constraint,
    };
  }
  return { message: String(error) };
}

async function main(): Promise<void> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { findEmployeeAppAccountByUsernameGlobal } = await import(
    '@/modules/employee-app/data/accounts.repository'
  );
  const { listEmployeePermissionGrants } = await import(
    '@/modules/employee-app/data/grants.repository'
  );
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import(
    '@/shared/auth/org-authz-memo'
  );
  const { saveEmployeeAppGrants } = await import(
    '@/modules/employee-app/application/account-lifecycle'
  );
  const { PERMISSIONS } = await import('@/shared/permissions/catalog');

  const username = resolveSmokeUsername();
  const admin = getAdminDb();
  const ownerUserId = await findOwnerUserId(admin);
  const account = await findEmployeeAppAccountByUsernameGlobal(admin, username);
  if (!account) throw new Error(`Employee account ${username} not found`);

  const employeeId = account.employeeId;
  const before = await listEmployeePermissionGrants(admin, PROD_ORG, employeeId);

  const resolved = await resolveOrgContext(admin, {
    userId: ownerUserId,
    organizationId: PROD_ORG,
    locale: 'he-IL',
  });
  const snapshot = toOrgAuthzSnapshot(resolved);

  const toggleKey = PERMISSIONS.FORMS_READ;
  const hadFormsRead = before.some((g) => g.permissionKey === toggleKey && g.granted);
  const grants = before
    .filter((g) => g.granted)
    .map((g) => ({
      permissionKey: g.permissionKey,
      scope: g.scope,
      granted: g.permissionKey === toggleKey ? !hadFormsRead : true,
    }));

  if (!before.some((g) => g.permissionKey === toggleKey)) {
    grants.push({ permissionKey: toggleKey, scope: 'self_only', granted: true });
  }

  console.log(
    JSON.stringify(
      {
        employeeId,
        username,
        ownerUserId,
        beforeCount: before.length,
        toggleKey,
        hadFormsRead,
        action: hadFormsRead ? 'remove' : 'add',
      },
      null,
      2,
    ),
  );

  try {
    await withUserContext(ownerUserId, async (tx) => {
      const context = orgContextFromAuthzSnapshot(snapshot, {
        userId: ownerUserId,
        locale: 'he-IL',
        db: tx,
      });
      await saveEmployeeAppGrants(context, {
        employeeId,
        grants,
        documentCategories: new Map(),
      });
    });
    console.log(JSON.stringify({ saveResult: 'SUCCESS' }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ saveResult: 'FAILED', error: errorSummary(error) }, null, 2));
    process.exitCode = 1;
    return;
  }

  const after = await listEmployeePermissionGrants(admin, PROD_ORG, employeeId);
  const afterFormsRead = after.some((g) => g.permissionKey === toggleKey && g.granted);
  console.log(JSON.stringify({ afterCount: after.length, afterFormsRead, restored: false }, null, 2));

  // Restore original state
  await withUserContext(ownerUserId, async (tx) => {
    const context = orgContextFromAuthzSnapshot(snapshot, {
      userId: ownerUserId,
      locale: 'he-IL',
      db: tx,
    });
    await saveEmployeeAppGrants(context, {
      employeeId,
      grants: before.filter((g) => g.granted).map((g) => ({
        permissionKey: g.permissionKey,
        scope: g.scope,
        granted: true,
      })),
      documentCategories: new Map(),
    });
  });
  console.log(JSON.stringify({ restored: true }, null, 2));
}

main().catch((error) => {
  console.error(errorSummary(error));
  process.exit(1);
});
