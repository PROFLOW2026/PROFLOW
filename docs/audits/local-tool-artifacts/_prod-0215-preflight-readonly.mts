/**
 * READ-ONLY Production preflight for migration 0215. Never prints credentials.
 * All queries run inside BEGIN TRANSACTION READ ONLY and are rolled back.
 * Run: npx tsx docs/audits/local-tool-artifacts/_prod-0215-preflight-readonly.mts
 */
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  buildJournalTagHashMap,
  findOutOfOrderSkippedTags,
  listPendingJournalTags,
  loadJournalEntries,
  maxAppliedCreatedAt,
} from '../../../drizzle/scripts/migration-approval-gate';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

function parseEnvFile(path: string): Record<string, string> {
  return dotenv.parse(readFileSync(path, 'utf8'));
}

function urlParts(raw: string | undefined): { user: string; host: string; db: string } | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return { user: decodeURIComponent(url.username), host: url.hostname, db: url.pathname.slice(1) };
  } catch {
    return null;
  }
}

const migratorUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const vercelEnv = parseEnvFile('.vercel/.env.production.local');
const runtimeAdminUrl = vercelEnv.DIRECT_DATABASE_URL ?? vercelEnv.DATABASE_URL;
const runtimeRequestUrl = vercelEnv.DATABASE_URL;

const migrator = urlParts(migratorUrl);
const runtimeAdmin = urlParts(runtimeAdminUrl);
const runtimeRequest = urlParts(runtimeRequestUrl);

const client = postgres(migratorUrl!, { max: 1, prepare: false, onnotice: () => {} });

try {
  const result = await client.begin('ISOLATION LEVEL REPEATABLE READ READ ONLY', async (tx) => {
    const applied = await tx<{ hash: string; created_at: string }[]>`
      select hash, created_at from drizzle.__drizzle_migrations order by created_at asc
    `;
    const me = await tx<{ current_user: string; session_user: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select current_user, session_user, r.rolsuper, r.rolbypassrls
      from pg_roles r where r.rolname = current_user
    `;
    const runtimeRoles = await tx<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolname, rolsuper, rolbypassrls from pg_roles
      where rolname = any(${[runtimeAdmin?.user ?? '', runtimeRequest?.user ?? '', 'service_role', 'authenticated', 'anon']})
    `;
    const objects = await tx`
      select
        to_regclass('public.demo_sessions') is not null as demo_sessions,
        to_regclass('public.demo_takeoff_purge_proof') is not null as purge_proof_table,
        to_regprocedure('app.project_budgets_guard()') is not null as budgets_guard,
        to_regprocedure('app.project_budget_history_guard()') is not null as history_guard,
        to_regprocedure('app.demo_takeoff_purge_proof_write()') is not null as purge_proof_fn,
        to_regprocedure('app.demo_session_budget_purge_allowed(uuid)') is not null as purge_allowed_fn_already,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'organizations' and column_name = 'demo_abandoned_at'
        ) as demo_abandoned_at_already,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'organizations' and column_name = 'demo_kind'
        ) as demo_kind_column
    `;
    const demoEvidence = await tx`
      select
        (select count(*)::int from public.demo_sessions) as live_sessions,
        (select count(*)::int from public.organizations where demo_kind = 'session') as session_orgs,
        (select count(*)::int from public.organizations
           where demo_kind = 'session' and name like '[דמו-נטוש]%') as soft_abandoned_orgs,
        (select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'demo_sessions') as demo_sessions_policies,
        (select relforcerowsecurity from pg_class where oid = 'public.demo_sessions'::regclass) as demo_sessions_force_rls
    `;
    const loginBypassRoles = await tx<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolname, rolsuper, rolbypassrls from pg_roles
      where rolcanlogin and (rolsuper or rolbypassrls) order by rolname
    `;
    return {
      applied,
      me: me[0],
      runtimeRoles,
      objects: objects[0],
      demoEvidence: demoEvidence[0],
      loginBypassRoles,
    };
  });

  const entries = loadJournalEntries();
  const tagToHash = buildJournalTagHashMap(entries);
  const lastAppliedAt = maxAppliedCreatedAt(result.applied);
  const pending = listPendingJournalTags(entries, lastAppliedAt);
  const skipped = findOutOfOrderSkippedTags(entries, result.applied, tagToHash);
  const hashToTag = new Map([...tagToHash].map(([tag, hash]) => [hash, tag]));
  const whenToTag = new Map(entries.map((e) => [e.when, e.tag]));
  const lastRows = result.applied.slice(-5).map((row) => ({
    created_at: Number(row.created_at),
    tagByWhen: whenToTag.get(Number(row.created_at)) ?? null,
    hashMatchesTag: hashToTag.get(row.hash) ?? null,
  }));

  console.log(
    JSON.stringify(
      {
        sameHostAsVercelProd: migrator?.host === runtimeAdmin?.host,
        migratorUser: migrator?.user,
        migratorHostSuffix: migrator?.host.split('.').slice(-3).join('.'),
        runtimeAdminUser: runtimeAdmin?.user,
        runtimeRequestUser: runtimeRequest?.user,
        ledgerCount: result.applied.length,
        lastLedgerRows: lastRows,
        pendingTags: pending,
        outOfOrderSkipped: skipped,
        migratorRole: result.me,
        runtimeRoles: result.runtimeRoles,
        objects: result.objects,
        demoEvidence: result.demoEvidence,
        loginBypassRoles: result.loginBypassRoles,
        vercelRuntimeUrlReadable: runtimeAdmin !== null,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
