import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';
import { seedSystemData } from '../seed/system';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Applies the idempotent system seed. Safe on every environment (doc 77 §5).
 */
async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('No DIRECT_DATABASE_URL or DATABASE_URL configured.');
    process.exitCode = 1;
    return;
  }

  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const db = drizzle(client, { schema, casing: 'snake_case' });
    const result = await seedSystemData(db as unknown as DbExecutor);
    console.log(`System seed complete: ${result.permissions} permissions, ${result.taxRules} tax rules.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
