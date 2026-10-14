import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const email = (process.env.OWNER_EMAIL ?? '18eran@gmail.com').toLowerCase();
const sql = postgres(url, { max: 1 });

const profile = await sql`
  SELECT id, email, display_name FROM profiles WHERE lower(email) = ${email} LIMIT 5`;

const memberships = profile.length
  ? await sql`
      SELECT om.organization_id, om.status AS membership_status, o.name AS org_name, o.created_at
      FROM organization_memberships om
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = ${profile[0].id}
      ORDER BY o.created_at DESC`
  : [];

const employeesLinked = profile.length
  ? await sql`
      SELECT e.organization_id, e.id, e.name, e.compensation_class, o.name AS org_name
      FROM employees e
      JOIN organizations o ON o.id = e.organization_id
      WHERE e.user_id = ${profile[0].id} AND e.archived_at IS NULL`
  : [];

console.log(JSON.stringify({ email, profile, memberships, employeesLinked }, null, 2));
await sql.end();
