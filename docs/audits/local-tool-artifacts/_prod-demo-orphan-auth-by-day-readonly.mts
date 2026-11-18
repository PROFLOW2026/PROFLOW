import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ path: '.env.local', override: true });
const c = postgres((process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)!, { max: 1, prepare: false, onnotice: () => {} });
try {
  const r = await c.begin('READ ONLY', async (tx) => tx`
    select (u.created_at at time zone 'Asia/Jerusalem')::date::text as day, count(*)::int as n
    from auth.users u
    where (u.email like '%@demo.pf.internal' or u.email like 'demo.%@employees.pf.internal' or u.email like 'demo.%@contractors.pf.internal')
      and not exists (select 1 from public.organization_memberships m where m.user_id = u.id)
    group by 1 order by 1
  `);
  console.log(JSON.stringify(r));
} finally { await c.end(); }
