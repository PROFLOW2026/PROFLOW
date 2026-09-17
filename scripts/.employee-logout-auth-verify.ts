/**
 * Read-only production verification for Employee logout + auth surface.
 * Run: npx tsx scripts/.employee-logout-auth-verify.ts
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { resolveOptionalSmokeUsername } from './lib/employee-app-script-safety';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_BASE = process.env.PROD_SMOKE_BASE_URL ?? 'https://proflow-two-bice.vercel.app';
const PROD_ORG = process.env.PROD_SMOKE_ORG_ID ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

async function main(): Promise<void> {
  const report: Record<string, unknown> = {};

  const loginRes = await fetch(`${PROD_BASE}/he-IL/employee/login`, { redirect: 'manual' });
  const loginHtml = loginRes.status === 200 ? await loginRes.text() : '';
  report.employeeLoginPage = loginRes.status === 200 ? 'PASS' : 'FAIL';
  report.employeeLoginHasUsername = loginHtml.includes('name="username"') ? 'PASS' : 'FAIL';

  const empRes = await fetch(`${PROD_BASE}/he-IL/employee`, { redirect: 'manual' });
  report.unauthEmployeeRedirects = [307, 308, 302, 303].includes(empRes.status) ? 'PASS' : 'FAIL';
  report.unauthEmployeeLocation = empRes.headers.get('location');

  const ownerRes = await fetch(`${PROD_BASE}/he-IL/dashboard`, { redirect: 'manual' });
  report.unauthDashboardRedirects = [307, 308, 302, 303].includes(ownerRes.status) ? 'PASS' : 'FAIL';

  const settingsRes = await fetch(`${PROD_BASE}/he-IL/settings`, { redirect: 'manual' });
  report.unauthSettingsRedirects = [307, 308, 302, 303].includes(settingsRes.status) ? 'PASS' : 'FAIL';

  const { getAdminDb } = await import('@/shared/db/client');
  const admin = getAdminDb();

  const smokeUsername = resolveOptionalSmokeUsername();
  report.smokeUsername = smokeUsername ?? 'SKIPPED';

  const acct = smokeUsername
    ? await admin.execute(sql`
    SELECT ea.employee_id, ea.username, ea.status, e.name
    FROM employee_app_accounts ea
    JOIN employees e ON e.id = ea.employee_id
    WHERE ea.username_normalized = ${smokeUsername}
      AND ea.organization_id = ${PROD_ORG}::uuid
    LIMIT 1
  `)
    : [];
  report.smokeAccount = acct[0] ?? null;

  if (acct[0]) {
    const employeeId = (acct[0] as { employee_id: string }).employee_id;
    report.smokeGrants = await admin.execute(sql`
      SELECT permission_key, scope, granted
      FROM employee_permission_grants
      WHERE organization_id = ${PROD_ORG}::uuid
        AND employee_id = ${employeeId}::uuid
        AND granted = true
      ORDER BY permission_key
    `);
    report.smokeDocumentCategories = await admin.execute(sql`
      SELECT category, allowed
      FROM employee_document_category_grants
      WHERE organization_id = ${PROD_ORG}::uuid
        AND employee_id = ${employeeId}::uuid
        AND allowed = true
    `);
    report.smokeAssignments = await admin.execute(sql`
      SELECT project_id, status
      FROM employee_project_assignments
      WHERE organization_id = ${PROD_ORG}::uuid
        AND employee_id = ${employeeId}::uuid
        AND status = 'active'
    `);
  }

  report.storageProviders = await admin.execute(sql`
    SELECT provider, status
    FROM organization_storage_connections
    WHERE organization_id = ${PROD_ORG}::uuid
  `);

  report.externalStorageDocuments = await admin.execute(sql`
    SELECT storage_backend, count(*)::int AS c
    FROM documents
    WHERE organization_id = ${PROD_ORG}::uuid
      AND deleted_at IS NULL
      AND storage_backend IS NOT NULL
      AND storage_backend <> 'internal'
    GROUP BY storage_backend
  `);

  report.logoutLabelOnLoginPage = loginHtml.includes('התנתקות')
    ? 'YES (unexpected on login)'
    : 'NO (expected — logout on authenticated shell)';

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
