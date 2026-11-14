import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../../');
const world = JSON.parse(readFileSync(path.join(repoRoot, 'tests/e2e/.world.json'), 'utf8'));
const opsId = '12121212-1212-4212-8212-121212121212';
const sql = postgres('postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e', {
  max: 1,
  prepare: false,
});

try {
  const accounts = await sql`
    select id, organization_id, username, auth_email, status, pin_must_change
    from employee_app_accounts
    where username_normalized = 'opspm'
  `;
  const mem = await sql`
    select om.organization_id, om.status, o.name
    from organization_memberships om
    join organizations o on o.id = om.organization_id
    where om.user_id = ${opsId}
  `;
  const prefs = await sql`
    select user_id, active_organization_id
    from user_preferences
    where user_id = ${opsId}
  `;
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name ilike '%contractor%'
    order by table_name
  `;
  const out = {
    world: {
      gcOrganizationId: world.gcOrganizationId,
      gcOpsUsername: world.gcOpsUsername,
      gcContractorUsername: world.gcContractorUsername,
      gcProjectId: world.gcProjectId,
    },
    accounts,
    memberships: mem,
    prefs,
    contractorTables: tables,
    orgMatch: accounts[0] ? accounts[0].organization_id === world.gcOrganizationId : false,
    membershipIncludesAccountOrg: accounts[0]
      ? mem.some((m) => m.organization_id === accounts[0].organization_id)
      : false,
  };
  writeFileSync(path.join(here, 'ops-seed-probe.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
