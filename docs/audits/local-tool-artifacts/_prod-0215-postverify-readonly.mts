import dotenv from 'dotenv';
import postgres from 'postgres';
import { computeMigrationFileHash } from '../../../drizzle/scripts/migration-approval-gate';
import { readFileSync } from 'node:fs';
dotenv.config({ path: '.env.local', override: true });
const c = postgres((process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)!, { max: 1, prepare: false, onnotice: () => {} });
try {
  const r = await c.begin('READ ONLY', async (tx) => {
    const ledger = await tx`select count(*)::int as n, max(created_at)::text as last from drizzle.__drizzle_migrations`;
    const last = await tx`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`;
    const col = await tx`select data_type from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='demo_abandoned_at'`;
    const fn = await tx`select p.prosrc ~ 'rolbypassrls' as has_role_check, p.prosrc ~ 'authenticator' as denies_request_roles, p.prosecdef as security_definer, l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.oid = 'app.demo_session_budget_purge_allowed(uuid)'::regprocedure`;
    const grants = await tx`select has_function_privilege('authenticated','app.demo_session_budget_purge_allowed(uuid)','EXECUTE') as auth_exec, has_function_privilege('anon','app.demo_session_budget_purge_allowed(uuid)','EXECUTE') as anon_exec`;
    const guards = await tx`select (select prosrc ~ 'demo_session_budget_purge_allowed' from pg_proc where oid='app.project_budgets_guard()'::regprocedure) as budgets_guard_updated, (select prosrc ~ 'demo_session_budget_purge_allowed' from pg_proc where oid='app.project_budget_history_guard()'::regprocedure) as history_guard_updated, (select prosrc ~ 'demo_abandoned_at' from pg_proc where oid='app.demo_takeoff_purge_proof_write()'::regprocedure) as proof_fn_updated`;
    const data = await tx`select count(*)::int as with_marker from public.organizations where demo_abandoned_at is not null`;
    const probe = await tx`select app.demo_session_budget_purge_allowed('00000000-0000-0000-0000-000000000000'::uuid) as no_flag`;
    return { ledger: ledger[0], lastHash: last[0].hash, col: col[0], fn: fn[0], grants: grants[0], guards: guards[0], data: data[0], probe: probe[0] };
  });
  const fileHash = computeMigrationFileHash(readFileSync('drizzle/migrations/0215_demo_session_cleanup.sql', 'utf8'));
  console.log(JSON.stringify({ ...r, ledgerHashMatchesFile: r.lastHash === fileHash, lastHash: undefined }, null, 2));
} finally { await c.end(); }

