import postgres from 'postgres';

const url = process.env.REMEDIATION_POSTGRES_URL ?? '';
if (!url) throw new Error('REMEDIATION_POSTGRES_URL is required');
const parsed = new URL(url);
const port = Number(parsed.port);
if (parsed.hostname !== '127.0.0.1' || port < 56000 || port === 55432 || port === 55433) {
  throw new Error('refusing non-isolated database');
}

const sql = postgres(url, { max: 1 });
const failures = [];
function pass(name) { console.log('PASS', name); }
function fail(name, error) {
  failures.push(name);
  console.error('FAIL', name, error instanceof Error ? error.message : error);
}

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';

try {
  await sql`drop table if exists probe_projects`;
  await sql`create table probe_projects (id uuid primary key)`;
  await sql`insert into probe_projects (id) values (${a}::uuid), (${b}::uuid)`;
  const empty = await sql`select id from probe_projects where false`;
  if (empty.length !== 0) throw new Error('empty list matched ' + empty.length);
  const one = await sql`select id::text as id from probe_projects where id = ANY(ARRAY[${a}::uuid]::uuid[])`;
  if (one.length !== 1 || one[0].id !== a) throw new Error('one id ' + JSON.stringify(one));
  const many = await sql`select id::text as id from probe_projects where id = ANY(ARRAY[${a}::uuid, ${b}::uuid]::uuid[]) order by id`;
  if (many.length !== 2) throw new Error('many ' + JSON.stringify(many));
  const other = await sql`select id from probe_projects where id = ANY(ARRAY[${c}::uuid]::uuid[])`;
  if (other.length !== 0) throw new Error('foreign id matched');
  pass('B-01 uuid array 0/1/N');
} catch (error) {
  fail('B-01 uuid array 0/1/N', error);
}

try {
  await sql`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
  end $$`;
  await sql`drop table if exists public.integration_entity_mappings cascade`;
  await sql`drop table if exists public.integration_sync_jobs cascade`;
  await sql`create table public.integration_entity_mappings (id int)`;
  await sql`create table public.integration_sync_jobs (id int)`;
  await sql`insert into public.integration_entity_mappings (id) values (1)`;
  await sql`revoke all on public.integration_entity_mappings from public`;
  await sql`revoke all on public.integration_sync_jobs from public`;
  await sql`revoke all on public.integration_entity_mappings from authenticated`;
  await sql`revoke all on public.integration_sync_jobs from authenticated`;
  await sql`grant authenticated to postgres`;
  let denied = false;
  try {
    await sql.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select id from public.integration_entity_mappings`;
    });
  } catch (error) {
    denied = Boolean(error && error.code === '42501');
    if (!denied) throw error;
  }
  if (!denied) throw new Error('authenticated select was allowed');
  const ownerRows = await sql`select id from public.integration_entity_mappings`;
  if (ownerRows.length !== 1) throw new Error('owner read broke');
  pass('B-02 revoke still denies authenticated');
} catch (error) {
  fail('B-02 revoke still denies authenticated', error);
}

try {
  await sql`create schema if not exists app`;
  await sql`create or replace function app.current_user_id() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$`;
  await sql`create or replace function app.is_org_member(org uuid) returns boolean language sql stable as $$ select true $$`;
  await sql`create or replace function app.has_org_permission(org uuid, permission text) returns boolean language sql stable as $$ select false $$`;
  await sql`drop table if exists public.notification_attention_badge_snapshots cascade`;
  await sql`drop table if exists public.notifications cascade`;
  await sql`drop table if exists public.employee_app_accounts cascade`;
  await sql`create table public.employee_app_accounts (organization_id uuid, user_id uuid, status text)`;
  await sql`create table public.notifications (organization_id uuid, recipient_user_id uuid, body text)`;
  await sql`create table public.notification_attention_badge_snapshots (organization_id uuid, user_id uuid, payload text)`;
  await sql`alter table public.notifications enable row level security`;
  await sql`alter table public.notifications force row level security`;
  await sql`alter table public.notification_attention_badge_snapshots enable row level security`;
  await sql`alter table public.notification_attention_badge_snapshots force row level security`;
  await sql`grant select on public.employee_app_accounts to authenticated`;
  await sql`grant select on public.notifications to authenticated`;
  await sql`grant select, insert, update, delete on public.notification_attention_badge_snapshots to authenticated`;
  await sql.unsafe(`CREATE POLICY notifications_tenant_select ON public.notifications
    FOR SELECT TO authenticated
    USING (
      recipient_user_id = app.current_user_id()
      AND app.is_org_member(organization_id)
      AND (
        app.has_org_permission(organization_id, 'notifications.read')
        OR EXISTS (
          SELECT 1 FROM public.employee_app_accounts account
          WHERE account.organization_id = notifications.organization_id
            AND account.user_id = app.current_user_id()
            AND account.status = 'active'
        )
      )
    )`);
  await sql.unsafe(`CREATE POLICY notification_attention_badge_snapshots_self ON public.notification_attention_badge_snapshots
    FOR ALL TO authenticated
    USING (
      user_id = app.current_user_id()
      AND app.is_org_member(organization_id)
      AND (
        app.has_org_permission(organization_id, 'notifications.read')
        OR EXISTS (
          SELECT 1 FROM public.employee_app_accounts account
          WHERE account.organization_id = notification_attention_badge_snapshots.organization_id
            AND account.user_id = app.current_user_id()
            AND account.status = 'active'
        )
      )
    )
    WITH CHECK (
      user_id = app.current_user_id()
      AND app.is_org_member(organization_id)
      AND (
        app.has_org_permission(organization_id, 'notifications.read')
        OR EXISTS (
          SELECT 1 FROM public.employee_app_accounts account
          WHERE account.organization_id = notification_attention_badge_snapshots.organization_id
            AND account.user_id = app.current_user_id()
            AND account.status = 'active'
        )
      )
    )`);
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await sql`insert into public.employee_app_accounts (organization_id, user_id, status) values (${org}::uuid, ${a}::uuid, 'active')`;
  await sql`insert into public.notifications (organization_id, recipient_user_id, body) values (${org}::uuid, ${a}::uuid, 'mine'), (${org}::uuid, ${b}::uuid, 'theirs')`;
  const rows = await sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${a}, true)`;
    await tx`set local role authenticated`;
    return tx`select body from public.notifications`;
  });
  if (rows.length !== 1 || rows[0].body !== 'mine') throw new Error(JSON.stringify(rows));
  pass('B-03 employee self policy hides other users');
} catch (error) {
  fail('B-03 employee self policy hides other users', error);
}

try {
  await sql.unsafe("CREATE OR REPLACE FUNCTION app.remed_savepoint_probe() RETURNS void AS ' BEGIN BEGIN RAISE EXCEPTION ''closed_period_immutable''; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ''%closed_period_immutable%'' THEN RAISE EXCEPTION ''lost original error''; END IF; END; PERFORM 1; END ' LANGUAGE plpgsql");
  await sql`select app.remed_savepoint_probe()`;
  pass('B-06 savepoint keeps the original error');
} catch (error) {
  fail('B-06 savepoint keeps the original error', error);
}

await sql.end();
if (failures.length) {
  console.error('SMOKE FAILED', failures.join(', '));
  process.exit(1);
}
console.log('SMOKE PASSED');
