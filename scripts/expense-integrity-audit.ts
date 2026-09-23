/**
 * Organization-scoped expense integrity audit / repair.
 *
 * Usage:
 *   npx tsx scripts/expense-integrity-audit.ts --org <uuid> [--repair]
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { Database, Transaction } from '@/shared/db/types';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL =
  process.env.EU_DIRECT_DATABASE_URL ??
  process.env.DIRECT_DATABASE_URL ??
  process.env.EU_DATABASE_URL ??
  process.env.DATABASE_URL ??
  '';

function getScriptDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  const client = postgres(connectionString, { prepare: false, max: 1, idle_timeout: 20 });
  return drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;
}

async function withUserContextScript<T>(
  db: Database,
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as Transaction);
  });
}

async function withOrgContext<T>(
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const db = getScriptDb();
  const { resolveOrgContext } = await import('@/modules/tenancy/application/resolve-org-context');
  const rows = await db.execute(sql`
    SELECT om.user_id FROM organization_memberships om
    WHERE om.status = 'active' AND om.organization_id = ${organizationId}
    ORDER BY om.created_at ASC LIMIT 1
  `);
  const row = rows[0] as { user_id: string } | undefined;
  if (!row) throw new Error(`No active member for org ${organizationId}`);
  return withUserContextScript(db, row.user_id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: row.user_id,
      organizationId,
      locale: 'he-IL',
    });
    return fn(context);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const orgIdx = args.indexOf('--org');
  const organizationId = orgIdx >= 0 ? args[orgIdx + 1] : process.env.AUDIT_ORG_ID;
  const repair = args.includes('--repair');

  if (!organizationId) {
    console.error('Missing --org <organizationId>');
    process.exit(1);
  }

  const { auditExpenseIntegrity, repairExpenseIntegrityIssues } = await import(
    '@/modules/expenses/application/expense-integrity-audit'
  );

  const before = await withOrgContext(organizationId, (context) => auditExpenseIntegrity(context));
  console.log(JSON.stringify({ phase: 'before', organizationId, ...before }, null, 2));

  if (repair && before.autoRepairableCount > 0) {
    const repairable = before.issues.filter((issue) => issue.autoRepairable);
    const result = await withOrgContext(organizationId, (context) =>
      repairExpenseIntegrityIssues(context, repairable),
    );
    const after = await withOrgContext(organizationId, (context) => auditExpenseIntegrity(context));
    console.log(JSON.stringify({ phase: 'repair', ...result }, null, 2));
    console.log(JSON.stringify({ phase: 'after', organizationId, ...after }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
