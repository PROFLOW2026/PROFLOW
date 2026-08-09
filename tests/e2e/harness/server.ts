import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@drizzle/schema';
import type { Database } from '@/shared/db/types';
import { applyMigrations } from './migrate';
import { startAuthStub } from './auth-stub';
import { AUTH_PORT, DATABASE_PORT } from './config';
import { seedWorld } from './seed';

/**
 * Entry point for the end-to-end harness process.
 *
 * Brings up a real Postgres (PGlite over the wire protocol) and the auth
 * stand-in, applies the actual migrations, seeds the world, then reports
 * healthy so Playwright can start the application against it.
 */
async function main(): Promise<void> {
  const client = new PGlite();
  await client.waitReady;

  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;

  await applyMigrations(client);
  const world = await seedWorld(db);

  await writeFile(
    path.resolve(process.cwd(), 'tests/e2e/.world.json'),
    `${JSON.stringify(world, null, 2)}\n`,
    'utf8',
  );

  const socketServer = new PGLiteSocketServer({ db: client, port: DATABASE_PORT, host: '127.0.0.1' });
  await socketServer.start();

  const stopAuth = await startAuthStub(AUTH_PORT);

  console.log(`[harness] postgres ready on ${DATABASE_PORT}`);
  console.log(`[harness] auth ready on ${AUTH_PORT}`);
  console.log('[harness] ready');

  const shutdown = async () => {
    await stopAuth();
    await socketServer.stop();
    await client.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('[harness] failed to start', error);
  process.exit(1);
});
