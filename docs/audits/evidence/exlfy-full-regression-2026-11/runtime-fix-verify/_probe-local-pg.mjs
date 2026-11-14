import postgres from 'postgres';

const sql = postgres('postgres://postgres:postgres@127.0.0.1:5432/postgres', {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

try {
  const rows = await sql`
    SELECT datname FROM pg_database WHERE datname LIKE ${'projectflow%'}
  `;
  console.log(JSON.stringify(rows, null, 2));
} catch (error) {
  console.error('LOCAL_PG_FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
