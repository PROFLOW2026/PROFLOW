import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ path: '.env.local', override: true });
const c = postgres((process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)!, { max: 1, prepare: false, onnotice: () => {} });
try {
  const r = await c.begin('READ ONLY', async (tx) => {
    const fks = await tx`
      select con.conrelid::regclass::text as from_table, con.confdeltype as on_delete, count(*)::int as n
      from pg_constraint con
      where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass
      group by 1, 2 order by 1`;
    const profileFk = await tx`
      select con.confrelid::regclass::text as to_table, con.confdeltype as on_delete
      from pg_constraint con where con.contype = 'f' and con.conrelid = 'public.profiles'::regclass`;
    const triggers = await tx`
      select tgname, tgrelid::regclass::text as tbl from pg_trigger
      where not tgisinternal and (tgrelid = 'auth.users'::regclass or tgrelid = 'public.profiles'::regclass)`;
    return { fks, profileFk, triggers };
  });
  console.log(JSON.stringify(r));
} finally { await c.end(); }
