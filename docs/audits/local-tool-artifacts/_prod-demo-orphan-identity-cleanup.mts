/**
 * Owner-approved (2026-11-18) one-time removal of orphan demo actor identities through
 * `sweepOrphanDemoIdentities`, the same function the nightly cron runs.
 *
 * Default is a read-only dry run that classifies every candidate. `--execute` runs the sweep.
 *
 * Run: npx tsx --conditions=react-server docs/audits/local-tool-artifacts/_prod-demo-orphan-identity-cleanup.mts [--execute]
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const { sql } = await import('drizzle-orm');
const { getAdminDb } = await import('@/shared/db/client');
const { sweepOrphanDemoIdentities } = await import('@/modules/demo/application/orphan-identities');
const { deleteDemoAuthUserViaSupabase } = await import(
  '@/modules/demo/application/supabase-demo-auth-deletion'
);
const { demoMintedOrganizationId } = await import('@/modules/demo/domain/identity-rule');
const { isSupabaseAdminConfigured } = await import('@/shared/supabase/admin');

const execute = process.argv.includes('--execute');
type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: Row[] }).rows ?? []) as Row[]);

const db = getAdminDb();

async function census() {
  const [counts] = rows(
    await db.execute(sql`
      select
        (select count(*)::int from profiles p
          where (lower(p.email) like '%@demo.pf.internal' or lower(p.email) like 'demo.%@employees.pf.internal' or lower(p.email) like 'demo.%@contractors.pf.internal')
            and not exists (select 1 from organization_memberships m where m.user_id = p.id)
            and not exists (select 1 from demo_session_actors a where a.auth_user_id = p.id)) as orphan_demo_profiles,
        (select count(*)::int from auth.users u
          where (lower(u.email) like '%@demo.pf.internal' or lower(u.email) like 'demo.%@employees.pf.internal' or lower(u.email) like 'demo.%@contractors.pf.internal')
            and not exists (select 1 from organization_memberships m where m.user_id = u.id)
            and not exists (select 1 from demo_session_actors a where a.auth_user_id = u.id)) as orphan_demo_auth_users,
        (select count(*)::int from demo_session_actors) as live_session_actors,
        (select count(*)::int from profiles) as profiles_total,
        (select count(*)::int from organizations where demo_kind is null) as real_orgs
    `),
  );
  return counts;
}

async function classify() {
  const candidates = rows(
    await db.execute(sql`
      select p.id, lower(p.email) as email
      from profiles p
      where (lower(p.email) like '%@demo.pf.internal' or lower(p.email) like 'demo.%@employees.pf.internal' or lower(p.email) like 'demo.%@contractors.pf.internal')
        and not exists (select 1 from organization_memberships m where m.user_id = p.id)
        and not exists (select 1 from demo_session_actors a where a.auth_user_id = p.id)
    `),
  );
  const tally = { candidates: candidates.length, notExactDemoAddress: 0, mintedOrgStillExists: 0, eligible: 0 };
  for (const candidate of candidates) {
    const mintedFor = demoMintedOrganizationId(String(candidate.email));
    if (!mintedFor) {
      tally.notExactDemoAddress += 1;
      continue;
    }
    const exists = rows(await db.execute(sql`select 1 from organizations where id = ${mintedFor}::uuid`)).length > 0;
    if (exists) tally.mintedOrgStillExists += 1;
    else tally.eligible += 1;
  }
  return tally;
}

const before = await census();
const classification = await classify();
console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', before, classification }, null, 2));
if (!execute) process.exit(0);
if (!isSupabaseAdminConfigured()) {
  console.error('ABORTED: Supabase admin is not configured; nothing was changed.');
  process.exit(2);
}

const result = await sweepOrphanDemoIdentities(
  db,
  { deleteAuthUser: deleteDemoAuthUserViaSupabase },
  { limit: 1000 },
);
console.log(JSON.stringify({ result, after: await census() }, null, 2));
process.exit(0);
