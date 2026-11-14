import postgres from 'postgres';

const url =
  process.env.DATABASE_URL?.trim() ||
  'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  const profiles = await sql`
    SELECT id, email FROM profiles WHERE email LIKE '%e2e%' ORDER BY email
  `;
  const orgs = await sql`SELECT count(*)::int AS n FROM organizations`;
  const emps = await sql`SELECT count(*)::int AS n FROM employees`;
  console.log(JSON.stringify({ profiles, orgs, emps }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
