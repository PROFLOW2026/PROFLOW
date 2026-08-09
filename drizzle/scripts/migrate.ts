import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Controlled migration runner (doc 77 §1).
 *
 * `drizzle-kit push` is deliberately not part of any deployment path: schema
 * changes reach an environment only through the reviewed SQL files in
 * `drizzle/migrations`.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      'No DIRECT_DATABASE_URL or DATABASE_URL configured.\n' +
        'Copy .env.example to .env.local and point it at a non-production database.',
    );
    process.exitCode = 1;
    return;
  }

  // Migrations need a direct, non-pooled, single connection.
  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });

  try {
    console.log(`Applying migrations (APP_ENV=${process.env.APP_ENV ?? 'local'})…`);
    await migrate(drizzle(client), { migrationsFolder: './drizzle/migrations' });
    console.log('Migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
