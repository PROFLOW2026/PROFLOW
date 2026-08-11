import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres, { type Sql } from 'postgres';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applySqlMigrations, serializePglite, splitSqlStatements } from '@tests/setup/database';

const PATCH_PATH = path.resolve(
  process.cwd(),
  'tests/integration/pre0021/agent1-integrity-patch.sql',
);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to allocate ephemeral port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function applySqlFile(client: PGlite, filePath: string): Promise<void> {
  const raw = await readFile(filePath, 'utf8');
  for (const statement of splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''))) {
    try {
      await client.exec(statement);
    } catch (error) {
      throw new Error(
        `Failed applying ${path.basename(filePath)}:\n${statement.slice(0, 300)}\n\n${String(error)}`,
      );
    }
  }
}

/** Applies 0000–latest then Agent 1 integrity patch onto a disposable PGlite. */
export async function applyMigrationsAndAgent1Patch(client: PGlite): Promise<void> {
  await applySqlMigrations(client);
  await applySqlFile(client, PATCH_PATH);
}

export interface TwoConnectionHarness {
  readonly port: number;
  readonly sqlA: Sql;
  readonly sqlB: Sql;
  readonly close: () => Promise<void>;
}

/**
 * Real two-connection disposable Postgres via the repo's PGlite socket harness.
 * Uses one `postgres` pool with max=2 (two backend connections) — more stable
 * on pglite-socket than two separate client instances during startup.
 */
export async function openTwoConnectionHarness(
  prepare?: (client: PGlite) => Promise<void>,
): Promise<TwoConnectionHarness> {
  const port = await freePort();
  const client = serializePglite(new PGlite());
  let socketServer: PGLiteSocketServer | undefined;
  let pool: Sql | undefined;
  try {
    await client.waitReady;
    if (prepare) await prepare(client);

    socketServer = new PGLiteSocketServer({ db: client, port, host: '127.0.0.1' });
    await socketServer.start();

    pool = postgres({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      max: 2,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    // Force both pool slots open sequentially (avoids dual-handshake flake).
    await pool.begin(async (tx) => {
      await tx`select 1`;
    });
    await pool.begin(async (tx) => {
      await tx`select 1`;
    });
  } catch (error) {
    await pool?.end({ timeout: 2 }).catch(() => undefined);
    await socketServer?.stop().catch(() => undefined);
    if (!client.closed) {
      await client.close().catch(() => undefined);
    }
    throw error;
  }

  if (!pool || !socketServer) {
    throw new Error('PGlite harness failed to start');
  }

  return {
    port,
    sqlA: pool,
    sqlB: pool,
    close: async () => {
      await pool.end({ timeout: 2 }).catch(() => undefined);
      await socketServer.stop().catch(() => undefined);
      if (!client.closed) {
        await client.close().catch(() => undefined);
      }
    },
  };
}

export function isIntegrityFailure(error: unknown, token: string): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return message.includes(token) || /23514|23P01|check_violation|exclusion/i.test(message);
}

/**
 * PGlite socket may reset a contending connection under lock wait.
 * Safety property for races: final active sum must never exceed the bill NET.
 */
export function isContendedConnectionError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return /ECONNRESET|Connection terminated|other side closed|socket|CONNECT_TIMEOUT/i.test(
    message,
  );
}
