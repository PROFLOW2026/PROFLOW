import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('NO_DB_URL');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });
const rows = await sql`
  SELECT id, hash, created_at
  FROM drizzle.__drizzle_migrations
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log(JSON.stringify(rows, null, 2));
await sql.end();
