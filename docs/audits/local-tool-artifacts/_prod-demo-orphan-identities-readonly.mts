import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ path: '.env.local', override: true });
const c = postgres((process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)!, { max: 1, prepare: false, onnotice: () => {} });
try {
  const r = await c.begin('READ ONLY', async (tx) => tx`
    select
      (select count(*)::int from public.profiles p
        where (p.email like '%@demo.pf.internal' or p.email like 'demo.%@employees.pf.internal' or p.email like 'demo.%@contractors.pf.internal')
          and not exists (select 1 from public.organization_memberships m where m.user_id = p.id)) as orphan_demo_profiles,
      (select count(*)::int from auth.users u
        where (u.email like '%@demo.pf.internal' or u.email like 'demo.%@employees.pf.internal' or u.email like 'demo.%@contractors.pf.internal')
          and not exists (select 1 from public.organization_memberships m where m.user_id = u.id)) as orphan_demo_auth_users,
      (select count(*)::int from public.organization_memberships m join public.organizations o on o.id = m.organization_id where o.demo_kind = 'session') as session_memberships
  `);
  console.log(JSON.stringify(r[0]));
} finally { await c.end(); }
