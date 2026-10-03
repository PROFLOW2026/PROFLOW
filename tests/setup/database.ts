import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@drizzle/schema';
import type { Database, Transaction } from '@/shared/db/types';

/**
 * Integration-test database.
 *
 * No Docker or local Postgres is required: PGlite is a real Postgres build
 * compiled to WebAssembly, so the migrations - including RLS policies, CHECK
 * constraints and partial unique indexes - execute exactly as they will on
 * Supabase. That is what makes the cross-tenant isolation tests meaningful
 * rather than a mock.
 *
 * Set TEST_DATABASE_URL to run the same suite against a real throwaway
 * Postgres instead.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const WIP_MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations-wip');

/**
 * Normalises raw `db.execute` results. postgres-js returns an array while
 * PGlite returns `{ rows }`, and tests should not care which driver they got.
 */
export function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export interface TestDatabase {
  readonly db: Database;
  /** Same drizzle handle as `db` (production uses a separate admin pool). */
  readonly adminDb: Database;
  /** Runs `fn` as `authenticated` with `userId` pinned, exactly like production. */
  asUser: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>;
  /**
   * Same as `asUser`, but counts Drizzle logQuery callbacks during `fn`
   * (for N=1 vs N=30 batch round-trip regression tests).
   */
  asUserCountingQueries: <T>(
    userId: string,
    fn: (tx: Transaction) => Promise<T>,
  ) => Promise<{ result: T; queryCount: number }>;
  /** Bypasses RLS. Only for arranging fixtures, never for assertions about access. */
  asService: <T>(fn: (db: Database) => Promise<T>) => Promise<T>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** Active counter used by the optional Drizzle logger in wrapClient. */
let activeTestQueryCounter: { n: number } | null = null;

/**
 * Splits a migration file into statements while respecting dollar-quoted
 * bodies, which the RLS migration relies on heavily for its DO blocks and
 * function definitions.
 */
export function splitSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let dollarTag: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let singleQuote = false;

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      index += 1;
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 2;
        blockComment = false;
        continue;
      }
      index += 1;
      continue;
    }

    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (singleQuote) {
      current += char;
      if (char === "'") singleQuote = false;
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      current += '--';
      index += 2;
      lineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      current += '/*';
      index += 2;
      blockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      singleQuote = true;
      index += 1;
      continue;
    }

    if (char === '$') {
      const match = /^\$[A-Za-z_]*\$/.exec(source.slice(index));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    if (char === ';') {
      statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current.trim().length > 0) statements.push(current.trim());

  return statements.filter((statement) => {
    const withoutComments = statement
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    return withoutComments.length > 0;
  });
}

type CachedMigration = { name: string; statements: string[] };

let cachedMigrations: CachedMigration[] | null = null;
let cachedSnapshotBlob: Blob | null = null;
const openDatabases = new Set<TestDatabase>();

async function readMigrations(): Promise<CachedMigration[]> {
  if (cachedMigrations) return cachedMigrations;
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

  // Parallel-development aid (Developer/GC build): `PF_WIP_FILES=0156_x.sql,0159_y.sql` makes the
  // harness read those reserved migration slots from drizzle/migrations-wip/ instead, so an
  // in-progress migration only affects the process that opted in. Unset in CI / normal runs.
  const wipFiles = new Set(
    (process.env.PF_WIP_FILES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  const migrations: CachedMigration[] = [];
  for (const file of files) {
    const wipPath = path.join(WIP_MIGRATIONS_DIR, file);
    const source = wipFiles.has(file) && existsSync(wipPath) ? wipPath : path.join(MIGRATIONS_DIR, file);
    const raw = await readFile(source, 'utf8');
    // drizzle-kit separates statements with this marker in generated files.
    const normalised = raw.replaceAll('--> statement-breakpoint', '');
    migrations.push({ name: file, statements: splitSqlStatements(normalised) });
  }
  cachedMigrations = migrations;
  return migrations;
}

function migrationTag(fileName: string): string {
  return fileName.replace(/\.sql$/, '');
}

/** Supabase auth shim for throwaway Postgres / PGlite (not production). */
const AUTH_BOOTSTRAP_SQL = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
  $$;
`;

async function runMigrationStatements(
  runStatement: (statement: string) => Promise<void>,
  untilInclusive?: string,
): Promise<void> {
  const migrations = await readMigrations();
  for (const migration of migrations) {
    const tag = migrationTag(migration.name);
    if (untilInclusive && tag > untilInclusive) break;
    for (const statement of migration.statements) {
      try {
        await runStatement(statement);
      } catch (error) {
        throw new Error(
          `Migration ${migration.name} failed on statement:\n${statement.slice(0, 400)}\n\n${String(error)}`,
        );
      }
    }
    if (untilInclusive && tag === untilInclusive) break;
  }
}

/**
 * Applies committed SQL migrations onto a disposable PGlite.
 * `untilInclusive` is the journal tag (filename without `.sql`).
 */
export async function applySqlMigrations(
  client: PGlite,
  untilInclusive?: string,
): Promise<void> {
  await client.exec(AUTH_BOOTSTRAP_SQL);
  await runMigrationStatements(async (statement) => {
    await client.exec(statement);
  }, untilInclusive);
}

/**
 * Same migration chain as PGlite, on real throwaway PostgreSQL (E2E harness / TEST_DATABASE_URL).
 */
export async function applySqlMigrationsPostgres(
  client: { unsafe: (query: string) => Promise<unknown> },
  untilInclusive?: string,
): Promise<void> {
  await client.unsafe(AUTH_BOOTSTRAP_SQL);
  await runMigrationStatements(async (statement) => {
    await client.unsafe(statement);
  }, untilInclusive);
}

export async function withRawPglite<T>(fn: (client: PGlite) => Promise<T>): Promise<T> {
  const client = serializePglite(new PGlite());
  try {
    await client.waitReady;
    return await fn(client);
  } finally {
    if (!client.closed) {
      await client.close().catch(() => undefined);
    }
  }
}

async function snapshotKey(): Promise<string> {
  const migrations = await readMigrations();
  const hash = createHash('sha1');
  for (const migration of migrations) {
    hash.update(migration.name);
    hash.update('\0');
    for (const statement of migration.statements) {
      hash.update(statement);
      hash.update('\0');
    }
  }
  return `migrated-${hash.digest('hex').slice(0, 12)}`;
}

function snapshotPaths(key: string): { file: string; lock: string } {
  const dir = path.join(os.tmpdir(), 'projectflow-pglite-snapshots');
  return {
    file: path.join(dir, `${key}.tgz`),
    lock: path.join(dir, `${key}.lock`),
  };
}

async function acquireLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(String(process.pid));
      return async () => {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for PGlite snapshot lock: ${lockPath}`);
}

async function blobFromDump(dump: Blob | File): Promise<Blob> {
  const bytes = new Uint8Array(await dump.arrayBuffer());
  return new Blob([bytes]);
}

async function buildSnapshotFile(snapshotFile: string): Promise<Blob> {
  const started = Date.now();
  const builder = serializePglite(new PGlite());
  try {
    await builder.waitReady;
    await applySqlMigrations(builder);
    const dump = await builder.dumpDataDir('gzip');
    const blob = await blobFromDump(dump);
    const tmp = `${snapshotFile}.${process.pid}.tmp`;
    await mkdir(path.dirname(snapshotFile), { recursive: true });
    await writeFile(tmp, Buffer.from(await blob.arrayBuffer()));
    try {
      await rename(tmp, snapshotFile);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      if (!existsSync(snapshotFile)) throw error;
    }
    console.info(
      `[pglite] snapshot built in ${Date.now() - started}ms (${(await readMigrations()).length} migrations)`,
    );
    return blob;
  } finally {
    if (!builder.closed) {
      await builder.close().catch(() => undefined);
    }
  }
}

async function loadOrBuildSnapshot(): Promise<Blob> {
  if (cachedSnapshotBlob) return cachedSnapshotBlob;
  const { file, lock } = snapshotPaths(await snapshotKey());
  if (existsSync(file)) {
    cachedSnapshotBlob = new Blob([await readFile(file)]);
    return cachedSnapshotBlob;
  }

  const release = await acquireLock(lock);
  try {
    if (existsSync(file)) {
      cachedSnapshotBlob = new Blob([await readFile(file)]);
      return cachedSnapshotBlob;
    }
    cachedSnapshotBlob = await buildSnapshotFile(file);
    return cachedSnapshotBlob;
  } finally {
    await release();
  }
}

/**
 * PGlite is a single-connection WASM Postgres. Concurrent `query`/`exec` on the
 * same instance (e.g. `Promise.all` inside a transaction) deadlocks. Serialize
 * every wire call, including queries issued on a transaction client.
 */
function attachSerializedQueries(
  client: Pick<PGlite, 'query' | 'exec' | 'sql'>,
  box: { tail: Promise<unknown> },
): void {
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const run = box.tail.then(work, work);
    box.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const exec = client.exec.bind(client);
  const query = client.query.bind(client);
  const sqlFn = client.sql.bind(client);
  client.exec = ((...args: Parameters<PGlite['exec']>) =>
    enqueue(() => exec(...args))) as PGlite['exec'];
  client.query = ((...args: Parameters<PGlite['query']>) =>
    enqueue(() => query(...args))) as PGlite['query'];
  client.sql = ((...args: Parameters<PGlite['sql']>) =>
    enqueue(() => sqlFn(...args))) as PGlite['sql'];
}

export function serializePglite(client: PGlite): PGlite {
  attachSerializedQueries(client, { tail: Promise.resolve() });
  return client;
}

async function truncatePublicAndApp(client: PGlite): Promise<void> {
  await client.exec(`
    DO $$
    DECLARE stmt text;
    BEGIN
      SELECT string_agg(format('TRUNCATE TABLE %I.%I CASCADE', schemaname, tablename), '; ')
      INTO stmt
      FROM pg_tables
      WHERE schemaname IN ('public', 'app')
        AND tablename <> '__drizzle_migrations';
      IF stmt IS NOT NULL THEN EXECUTE stmt; END IF;
    END
    $$;
  `);
}

function wrapClient(client: PGlite): TestDatabase {
  const db = drizzle(client, {
    schema,
    casing: 'snake_case',
    logger: {
      logQuery() {
        if (activeTestQueryCounter) activeTestQueryCounter.n += 1;
      },
    },
  }) as unknown as Database;

  const asUser = async <T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.execute(sql`set local role authenticated`);
      return fn(tx as Transaction);
    });

  const asUserCountingQueries = async <T>(
    userId: string,
    fn: (tx: Transaction) => Promise<T>,
  ): Promise<{ result: T; queryCount: number }> => {
    const counter = { n: 0 };
    activeTestQueryCounter = counter;
    try {
      const result = await asUser(userId, fn);
      return { result, queryCount: counter.n };
    } finally {
      activeTestQueryCounter = null;
    }
  };

  const asService = async <T>(fn: (database: Database) => Promise<T>): Promise<T> => fn(db);

  const reset = async (): Promise<void> => {
    // A previous test may have left SET ROLE service_role on this connection.
    // Truncate runs as the database owner so revoked internal tables stay reachable.
    await client.exec('RESET ROLE');
    await truncatePublicAndApp(client);
  };

  let closing: Promise<void> | null = null;
  const handle: TestDatabase = {
    db,
    adminDb: db,
    asUser,
    asUserCountingQueries,
    asService,
    reset,
    close: async () => {
      openDatabases.delete(handle);
      if (closing) {
        await closing;
        return;
      }
      if (client.closed) return;
      closing = client.close();
      await closing;
    },
  };
  openDatabases.add(handle);
  return handle;
}

export async function closeAllTestDatabases(): Promise<void> {
  const pending = [...openDatabases];
  openDatabases.clear();
  await Promise.all(
    pending.map(async (database) => {
      await database.close().catch(() => undefined);
    }),
  );
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const started = Date.now();
  const snapshot = await loadOrBuildSnapshot();
  const client = serializePglite(new PGlite({ loadDataDir: snapshot }));
  try {
    await client.waitReady;
    console.info(`[pglite] cloned in ${Date.now() - started}ms pid=${process.pid}`);
    return wrapClient(client);
  } catch (error) {
    if (!client.closed) {
      await client.close().catch(() => undefined);
    }
    throw error;
  }
}
