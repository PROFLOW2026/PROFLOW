/**
 * Minimal DB RTT probe (local path). Run with real Supabase env loaded.
 * npx tsx --tsconfig scripts/profile-tsconfig.json scripts/measure-db-rtt.ts
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const realDbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!realDbUrl || /127\.0\.0\.1|localhost/.test(realDbUrl)) {
  throw new Error('Real Supabase DATABASE_URL required');
}
process.env.DATABASE_URL = realDbUrl;
process.env.DIRECT_DATABASE_URL = realDbUrl;
process.env.PF_TAB_PROFILE = '1';
(globalThis as { __projectflowSql?: unknown }).__projectflowSql = undefined;
(globalThis as { __projectflowAdminSql?: unknown }).__projectflowAdminSql = undefined;

async function main() {
  const { performance } = await import('node:perf_hooks');
  const { sql } = await import('drizzle-orm');
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { getTabProfileSpans, runWithTabProfile, summarizeProfile } = await import(
    '@/shared/perf/tab-profile'
  );
  const { summarizeQueryBreakdown } = await import('@/shared/db/profile-sql');

  const admin = getAdminDb();

  await runWithTabProfile(async () => {
    const t0 = performance.now();
    await admin.execute(sql`select 1 as ok`);
    const simpleSelectMs = Math.round(performance.now() - t0);
    console.info(`simpleSelectMs=${simpleSelectMs}`);
  });

  const rows = await admin.execute(sql`
    select om.user_id from organization_memberships om limit 1
  `);
  const userId = (rows[0] as { user_id: string } | undefined)?.user_id;
  if (!userId) throw new Error('No membership row');

  await runWithTabProfile(async () => {
    const t0 = performance.now();
    await withUserContext(userId, async (tx) => {
      await tx.execute(sql`select 1 as ok`);
    });
    const rlsTxMs = Math.round(performance.now() - t0);
    const spans = getTabProfileSpans();
    const breakdown = summarizeQueryBreakdown(spans);
    console.info(`rlsTransactionMs=${rlsTxMs}`);
    console.info(JSON.stringify({ summary: summarizeProfile(spans), breakdown }, null, 2));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
