import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@drizzle/schema';
import type { Database } from '@/shared/db/types';
import { applyMigrations } from './migrate';
import { startAuthStub } from './auth-stub';
import { AUTH_PORT, DATABASE_PORT } from './config';
import { isPostgresHarnessMode } from './database-mode';
import { bootPostgresHarness } from './postgres-boot';
import { seedWorld } from './seed';
import { writeWorldJson } from './world-json';

/**
 * Entry point for the end-to-end harness process.
 *
 * Brings up database (PGlite socket or external PostgreSQL), applies migrations,
 * seeds the world, starts the auth stand-in, then reports healthy so Playwright
 * can start the application against it.
 */
async function bootPgliteHarness(): Promise<{ socketServer: PGLiteSocketServer; client: PGlite }> {
  const client = new PGlite();
  await client.waitReady;

  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;

  await applyMigrations(client);
  const world = await seedWorld(db);
  await writeWorldJson(world);

  const socketServer = new PGLiteSocketServer({ db: client, port: DATABASE_PORT, host: '127.0.0.1' });
  await socketServer.start();
  console.log(`[harness] postgres ready on ${DATABASE_PORT}`);
  return { socketServer, client };
}

async function main(): Promise<void> {
  let socketServer: PGLiteSocketServer | undefined;
  let pgliteClient: PGlite | undefined;

  if (isPostgresHarnessMode()) {
    console.log('[harness] mode=postgres');
    await bootPostgresHarness();
  } else {
    console.log('[harness] mode=pglite');
    const pglite = await bootPgliteHarness();
    socketServer = pglite.socketServer;
    pgliteClient = pglite.client;
  }

  const stopAuth = await startAuthStub(AUTH_PORT);

  console.log(`[harness] auth ready on ${AUTH_PORT}`);
  console.log('[harness] ready');

  const shutdown = async () => {
    await stopAuth();
    if (socketServer) {
      await socketServer.stop();
    }
    if (pgliteClient) {
      await pgliteClient.close();
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error('[harness] failed to start', error);
  process.exit(1);
});
