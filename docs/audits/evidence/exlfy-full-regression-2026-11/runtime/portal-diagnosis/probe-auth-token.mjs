/**
 * Probe GoTrue stub token endpoint for ops vs single employee passwords.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../../');
const world = JSON.parse(readFileSync(path.join(repoRoot, 'tests/e2e/.world.json'), 'utf8'));
const pepperMaterial = 'projectflow-e2e-employee-auth-pepper-v1';
const pepper = createHash('sha256')
  .update('projectflow.employee.auth_password.v1\0', 'utf8')
  .update(pepperMaterial, 'utf8')
  .digest('hex')
  .slice(0, 43);

function passwordForPin(pin) {
  return `${pin}\u0000${pepper}`;
}

async function token(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    email,
    password,
  });
  // supabase-js posts JSON to /auth/v1/token?grant_type=password
  const res = await fetch('http://127.0.0.1:55321/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: 'e2e-anon-key',
      authorization: 'Bearer e2e-anon-key',
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return {
    status: res.status,
    userId: json?.user?.id ?? null,
    email: json?.user?.email ?? null,
    error: json?.error ?? json?.error_description ?? null,
    hasAccessToken: Boolean(json?.access_token),
  };
}

const sql = postgres('postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e', {
  max: 1,
  prepare: false,
});
try {
  const accounts = await sql`
    select username_normalized, auth_email, organization_id, user_id
    from employee_app_accounts
    where username_normalized in ('opspm', 'single99')
  `;
  const results = [];
  for (const row of accounts) {
    const pin = row.username_normalized === 'opspm' ? '135790' : '990011';
    const attempt = await token(row.auth_email, passwordForPin(pin));
    const mem = await sql`
      select organization_id, status from organization_memberships
      where user_id = ${row.user_id} and status = 'active'
    `;
    results.push({
      username: row.username_normalized,
      authEmail: row.auth_email,
      userId: row.user_id,
      organizationId: row.organization_id,
      memberships: mem,
      token: attempt,
    });
  }
  // also try ops@e2e.test with seed password and peppered pin
  results.push({
    label: 'ops@e2e.test seed password',
    token: await token('ops@e2e.test', 'projectflow-e2e-pass'),
  });
  results.push({
    label: 'ops@e2e.test peppered pin',
    token: await token('ops@e2e.test', passwordForPin('135790')),
  });
  writeFileSync(path.join(here, 'auth-token-probe.json'), JSON.stringify({ worldGcOrg: world.gcOrganizationId, results }, null, 2));
  console.log(JSON.stringify({ worldGcOrg: world.gcOrganizationId, results }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
