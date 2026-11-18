/**
 * Read-only Production census of demo organizations before enabling the abandoned-org sweeper.
 * Prints ids, kinds, counts and timestamps only; never credentials.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('database url missing');
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const result = await client.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
    const kinds = await tx`
      select coalesce(demo_kind, '(real)') as kind, count(*)::int as n
      from public.organizations group by 1 order by 1
    `;
    const sessionOrgs = await tx`
      select o.id, o.name, o.created_at, o.demo_abandoned_at,
        (s.organization_id is not null) as has_session,
        s.created_at as session_created_at, s.profile_key,
        (select count(*)::int from public.organization_memberships m where m.organization_id = o.id) as memberships,
        (select count(*)::int from public.demo_session_actors a where a.organization_id = o.id) as actors
      from public.organizations o
      left join public.demo_sessions s on s.organization_id = o.id
      where o.demo_kind = 'session'
      order by o.created_at
    `;
    const abandonedByName = await tx`
      select id, coalesce(demo_kind, '(real)') as kind, demo_abandoned_at, created_at
      from public.organizations where name like '%דמו-נטוש%'
    `;
    const nonSessionDemoLike = await tx`
      select id, name, coalesce(demo_kind, '(real)') as kind, created_at
      from public.organizations
      where (demo_kind is null or demo_kind <> 'session')
        and (name ilike '%דמו%' or name ilike '%demo%')
      order by created_at
    `;
    const orphanSessions = await tx`
      select s.organization_id, coalesce(o.demo_kind, '(real)') as kind
      from public.demo_sessions s left join public.organizations o on o.id = s.organization_id
      where o.id is null or o.demo_kind is distinct from 'session'
    `;
    const runs = await tx`
      select jerusalem_date::text, status, last_error from public.demo_reset_runs
      order by jerusalem_date desc limit 10
    `;
    const failedItems = await tx`
      select i.jerusalem_date::text, i.organization_id, i.phase, i.last_error,
        (o.id is not null) as org_exists, o.demo_kind, o.demo_abandoned_at,
        exists (select 1 from public.demo_sessions s where s.organization_id = i.organization_id) as has_session
      from public.demo_reset_items i left join public.organizations o on o.id = i.organization_id
      where i.status <> 'completed'
      order by i.jerusalem_date desc limit 50
    `;
    return { kinds, sessionOrgs, abandonedByName, nonSessionDemoLike, orphanSessions, runs, failedItems };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await client.end();
}
