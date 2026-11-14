import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres('postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e', {
  max: 1,
  prepare: false,
});
const opsId = '12121212-1212-4212-8212-121212121212';
try {
  const account = await sql`
    select id, organization_id, username, auth_email, status, failed_login_count, locked_until, last_login_at, pin_must_change
    from employee_app_accounts where username_normalized = 'opspm'
  `;
  const audit = await sql`
    select action, detail_json, created_at
    from employee_app_audit_events
    where employee_id = (select employee_id from employee_app_accounts where username_normalized = 'opspm')
    order by created_at desc
    limit 10
  `;
  const org = await sql`
    select id, name, archived_at from organizations
    where id = ${account[0]?.organization_id ?? null}
  `;
  const mem = await sql`
    select om.*, o.archived_at, o.name
    from organization_memberships om
    join organizations o on o.id = om.organization_id
    where om.user_id = ${opsId}
  `;
  const profile = await sql`select id, email, display_name from profiles where id = ${opsId}`;
  const out = { account, audit, org, mem, profile };
  writeFileSync(path.join(here, 'ops-after-fail.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
