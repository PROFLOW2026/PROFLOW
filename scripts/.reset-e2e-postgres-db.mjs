/**
 * Recreates the local throwaway E2E database (not production).
 * Matches CI: postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e
 */
import postgres from 'postgres';

const ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const DB_NAME = 'projectflow_e2e';

const sql = postgres(ADMIN_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`,
  );
  await sql.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await sql.unsafe(`CREATE DATABASE ${DB_NAME}`);
  console.log(`[e2e-db] recreated ${DB_NAME}`);
} finally {
  await sql.end({ timeout: 5 });
}
