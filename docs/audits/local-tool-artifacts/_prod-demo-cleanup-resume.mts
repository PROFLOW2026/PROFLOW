/**
 * Owner-approved (2026-11-18) completion of the failed nightly demo reset for Jerusalem date
 * 2026-11-18, through the same `runNightlyReset` mechanism the cron uses.
 *
 * Default is a read-only dry run. `--execute` resumes the run only when every queued candidate
 * passes the identity checks below; any doubt aborts before a single write.
 *
 * Run: npx tsx --conditions=react-server docs/audits/local-tool-artifacts/_prod-demo-cleanup-resume.mts [--execute]
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const { eq, sql } = await import('drizzle-orm');
const { organizationMemberships, profiles } = await import('@drizzle/schema');
const { getAdminDb } = await import('@/shared/db/client');
const { runNightlyReset } = await import('@/modules/demo/application/nightly-reset');
const { jerusalemDateKey } = await import('@/modules/demo/domain/reset-clock');
const { isDemoMintedEmail } = await import('@/modules/demo/domain/identity-rule');
const { getSupabaseAdminClient, isSupabaseAdminConfigured } = await import('@/shared/supabase/admin');

const RUN_DATE = '2026-11-18';
/** 03:00 Asia/Jerusalem on 2026-11-18 (UTC+2): sessions older than this were due for reset. */
const RESET_BOUNDARY = new Date('2026-11-18T01:00:00.000Z');
const execute = process.argv.includes('--execute');

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

const db = getAdminDb();

async function census() {
  return {
    sessionOrgs: rows(
      await db.execute(sql`
        select o.id, s.created_at as session_created_at, o.demo_abandoned_at,
          (s.organization_id is not null) as has_session
        from organizations o left join demo_sessions s on s.organization_id = o.id
        where o.demo_kind = 'session' order by o.created_at
      `),
    ),
    kinds: rows(
      await db.execute(sql`
        select coalesce(demo_kind, '(real)') as kind, count(*)::int as n
        from organizations group by 1 order by 1
      `),
    ),
    run: rows(
      await db.execute(sql`
        select status, last_error from demo_reset_runs where jerusalem_date = ${RUN_DATE}::date
      `),
    )[0],
  };
}

async function verifyCandidates() {
  const problems: string[] = [];
  const run = rows(
    await db.execute(sql`select status from demo_reset_runs where jerusalem_date = ${RUN_DATE}::date`),
  )[0];
  if (run?.status !== 'failed') problems.push(`run ${RUN_DATE} status is ${String(run?.status)}, expected failed`);

  const queued = rows(
    await db.execute(sql`
      select distinct organization_id from demo_reset_items
      where jerusalem_date = ${RUN_DATE}::date and status <> 'completed'
    `),
  ).map((row) => String(row.organization_id));

  const candidates: Row[] = [];
  for (const organizationId of queued) {
    const [org] = rows(
      await db.execute(sql`
        select o.id, o.demo_kind, o.demo_abandoned_at, o.created_at,
          s.created_at as session_created_at, s.template_organization_id,
          (select t.demo_kind from organizations t where t.id = s.template_organization_id) as template_kind,
          (select count(*)::int from external_principals p where p.home_organization_id = o.id) as principals
        from organizations o left join demo_sessions s on s.organization_id = o.id
        where o.id = ${organizationId}::uuid
      `),
    );
    if (!org) {
      candidates.push({ organizationId, state: 'already-removed' });
      continue;
    }
    const emails = rows(
      await db.execute(sql`
        select p.email from organization_memberships m join profiles p on p.id = m.user_id
        where m.organization_id = ${organizationId}::uuid
      `),
    ).map((row) => String(row.email ?? ''));
    const nonDemoMembers = emails.filter((email) => !isDemoMintedEmail(email)).length;
    const sessionCreatedAt = org.session_created_at ? new Date(String(org.session_created_at)) : null;
    const checks = {
      demoKindSession: org.demo_kind === 'session',
      hasSessionRow: sessionCreatedAt !== null,
      sessionBeforeResetBoundary: sessionCreatedAt !== null && sessionCreatedAt < RESET_BOUNDARY,
      templateIsDemoTemplate: org.template_kind === 'template',
      allMembersDemoMinted: nonDemoMembers === 0,
    };
    const ok = Object.values(checks).every(Boolean);
    if (!ok) problems.push(`${organizationId} failed identity checks ${JSON.stringify(checks)}`);
    candidates.push({
      organizationId,
      state: ok ? 'verified-expired-demo-session' : 'UNCERTAIN',
      sessionCreatedAt: sessionCreatedAt?.toISOString(),
      members: emails.length,
      ...checks,
    });
  }
  return { queued: queued.length, candidates, problems };
}

const before = await census();
const verification = await verifyCandidates();
const todayKey = jerusalemDateKey(new Date());
if (todayKey !== RUN_DATE) verification.problems.push(`Jerusalem date is ${todayKey}, not ${RUN_DATE}`);

console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', before, verification }, null, 2));

if (!execute) process.exit(0);
if (verification.problems.length > 0) {
  console.error('ABORTED: identity verification failed; nothing was changed.');
  process.exit(2);
}
if (!isSupabaseAdminConfigured()) {
  console.error('ABORTED: Supabase admin is not configured; nothing was changed.');
  process.exit(2);
}

const result = await runNightlyReset(db, {
  async deleteStoragePrefix() {
    return;
  },
  async deleteAuthUser(userId) {
    await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  },
  async profileEmail(profileId) {
    const [row] = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    return row?.email ?? null;
  },
  async membershipOrganizationIds(profileId) {
    const memberships = await db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, profileId));
    return memberships.map((row) => row.organizationId);
  },
});

const items = rows(
  await db.execute(sql`
    select organization_id, phase, status, last_error from demo_reset_items
    where jerusalem_date = ${RUN_DATE}::date order by organization_id, phase
  `),
);
console.log(JSON.stringify({ result, items, after: await census() }, null, 2));
process.exit(0);
