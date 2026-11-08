import postgres from 'postgres';

const url = process.env.REMEDIATION_POSTGRES_URL ?? '';
if (!url) throw new Error('REMEDIATION_POSTGRES_URL is required');
const parsed = new URL(url);
const port = Number(parsed.port);
if (parsed.hostname !== '127.0.0.1' || port < 56000 || port === 55432 || port === 55433) {
  throw new Error('refusing non-isolated database');
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const failures = [];
const pass = (name) => console.log('PASS', name);
const fail = (name, error) => {
  failures.push(name);
  console.error('FAIL', name, error instanceof Error ? error.message : error);
};

const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const recordA = '33333333-3333-4333-8333-333333333333';
const recordB = '44444444-4444-4444-8444-444444444444';
const hashOld = 'a'.repeat(64);
const hashNew = 'b'.repeat(64);

async function asUser(userId, fn) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  });
}

async function expectDenied(name, userId, fn) {
  try {
    await asUser(userId, fn);
    fail(name, new Error('update was allowed'));
  } catch (error) {
    if (error && error.code === '42501') pass(name);
    else fail(name, error);
  }
}

try {
  await sql`drop table if exists public.duplicate_warning_acknowledgements cascade`;
  await sql`drop table if exists public.auth_rate_limits cascade`;
  await sql`drop function if exists app.consume_auth_rate_limit(text, text, integer, integer)`;
  await sql`create schema if not exists app`;
  await sql`create table if not exists public.organizations (id uuid primary key)`;
  await sql`create table if not exists public.profiles (id uuid primary key)`;
  await sql`insert into public.organizations (id) values (${org}::uuid) on conflict do nothing`;
  await sql`insert into public.profiles (id) values (${userA}::uuid), (${userB}::uuid) on conflict do nothing`;
  await sql.unsafe(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    end $$;
  `);
  await sql`grant authenticated to postgres`;
  await sql`create or replace function app.current_user_id() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$`;
  await sql`create or replace function app.is_org_member(org uuid) returns boolean language sql stable as $$ select true $$`;
  await sql`grant usage on schema app to authenticated`;
  await sql`grant execute on function app.current_user_id() to authenticated`;
  await sql`grant execute on function app.is_org_member(uuid) to authenticated`;
  await sql.file('drizzle/migrations/0199_duplicate_warnings_and_auth_rate_limits.sql');
  await sql`grant usage on schema public to authenticated`;
  pass('0199 applied on the disposable database');
} catch (error) {
  fail('0199 applied on the disposable database', error);
  await sql.end();
  process.exit(1);
}

try {
  const inserted = await asUser(userA, (tx) => tx`
    insert into public.duplicate_warning_acknowledgements (
      organization_id, case_key, record_id, warning_type, snapshot_hash, status
    ) values (
      ${org}::uuid, 'expense:1', ${recordA}::uuid, 'expense_ap_overlap', ${hashOld}, 'pending'
    ) returning id::text as id
  `);
  if (!inserted[0]?.id) throw new Error('no id');
  const refreshed = await asUser(userA, (tx) => tx`
    update public.duplicate_warning_acknowledgements
    set record_id = ${recordB}::uuid
    where snapshot_hash = ${hashOld}
    returning record_id::text as record_id, status
  `);
  if (refreshed.length !== 1 || refreshed[0].record_id !== recordB || refreshed[0].status !== 'pending') {
    throw new Error(JSON.stringify(refreshed));
  }
  pass('repeated pending save keeps the row pending');
} catch (error) {
  fail('repeated pending save keeps the row pending', error);
}

await expectDenied('user A cannot approve in user B name', userA, (tx) => tx`
  update public.duplicate_warning_acknowledgements
  set status = 'acknowledged', approver_user_id = ${userB}::uuid, acknowledged_at = now()
  where snapshot_hash = ${hashOld}
`);

try {
  const acked = await asUser(userA, (tx) => tx`
    update public.duplicate_warning_acknowledgements
    set status = 'acknowledged', approver_user_id = app.current_user_id(), acknowledged_at = now()
    where snapshot_hash = ${hashOld}
    returning approver_user_id::text as approver, status
  `);
  if (acked.length !== 1 || acked[0].approver !== userA || acked[0].status !== 'acknowledged') {
    throw new Error(JSON.stringify(acked));
  }
  pass('user A approves only as the current user');
} catch (error) {
  fail('user A approves only as the current user', error);
}

async function unchangedHistorical(name, userId, statement) {
  try {
    const updated = await asUser(userId, statement);
    if (updated.length !== 0) {
      fail(name, new Error('update returned ' + JSON.stringify(updated)));
      return;
    }
  } catch (error) {
    if (!(error && error.code === '42501')) {
      fail(name, error);
      return;
    }
  }
  const [row] = await sql`
    select status, approver_user_id::text as approver, record_id::text as record_id
    from public.duplicate_warning_acknowledgements
    where snapshot_hash = ${hashOld}
  `;
  if (!row || row.status !== 'acknowledged' || row.approver !== userA || row.record_id !== recordB) {
    fail(name, new Error('historical row changed ' + JSON.stringify(row)));
    return;
  }
  pass(name);
}

await unchangedHistorical('acknowledged warning cannot return to pending', userA, (tx) => tx`
  update public.duplicate_warning_acknowledgements
  set status = 'pending', approver_user_id = null, acknowledged_at = null
  where snapshot_hash = ${hashOld}
  returning status
`);

await unchangedHistorical('user B cannot rewrite the historical approval', userB, (tx) => tx`
  update public.duplicate_warning_acknowledgements
  set approver_user_id = ${userB}::uuid, record_id = ${recordA}::uuid
  where snapshot_hash = ${hashOld}
  returning approver_user_id::text as approver
`);

try {
  await asUser(userA, (tx) => tx`
    insert into public.duplicate_warning_acknowledgements (
      organization_id, case_key, record_id, warning_type, snapshot_hash, status
    ) values (
      ${org}::uuid, 'expense:1', ${recordA}::uuid, 'expense_ap_overlap', ${hashNew}, 'pending'
    )
  `);
  const rows = await asUser(userA, (tx) => tx`
    select snapshot_hash, status, approver_user_id::text as approver
    from public.duplicate_warning_acknowledgements
    where case_key = 'expense:1'
    order by snapshot_hash
  `);
  const oldRow = rows.find((row) => row.snapshot_hash === hashOld);
  const newRow = rows.find((row) => row.snapshot_hash === hashNew);
  if (!oldRow || oldRow.status !== 'acknowledged' || oldRow.approver !== userA) {
    throw new Error('historical row changed ' + JSON.stringify(rows));
  }
  if (!newRow || newRow.status !== 'pending' || newRow.approver !== null) {
    throw new Error('new snapshot was not pending ' + JSON.stringify(rows));
  }
  pass('a new snapshot is a new pending row and the old approval stays');
} catch (error) {
  fail('a new snapshot is a new pending row and the old approval stays', error);
}

await sql.end();
if (failures.length) {
  console.error('RLS FAILED', failures.join(', '));
  process.exit(1);
}
console.log('RLS PASSED');
