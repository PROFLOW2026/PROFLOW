import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@drizzle/schema';
import type { Database } from '@/shared/db/types';
import { resolveHarnessDatabaseUrl } from './database-mode';
import { DATABASE_URL as PGLITE_DATABASE_URL } from './config';
import { seedWorld } from './seed';
import { writeWorldJson } from './world-json';

/**
 * Applies canonical Drizzle migrations and seeds the E2E world on real PostgreSQL.
 * Does not start a wire server — the app connects to DATABASE_URL directly.
 */
export async function bootPostgresHarness(): Promise<void> {
  const connectionString = resolveHarnessDatabaseUrl(PGLITE_DATABASE_URL);
  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle/migrations');
    console.log('[harness] applying migrations to postgres…');
    await migrate(drizzle(client, { schema, casing: 'snake_case' }), { migrationsFolder });
    const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;
    console.log('[harness] seeding E2E world…');
    const world = await seedWorld(db);
    await writeWorldJson(world);
    console.log('[harness] postgres migrations + seed complete');
  } finally {
    await client.end({ timeout: 5 });
  }
}
