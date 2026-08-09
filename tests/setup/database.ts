import { readFile, readdir } from 'node:fs/promises';
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
 * compiled to WebAssembly, so the migrations — including RLS policies, CHECK
 * constraints and partial unique indexes — execute exactly as they will on
 * Supabase. That is what makes the cross-tenant isolation tests meaningful
 * rather than a mock.
 *
 * Set TEST_DATABASE_URL to run the same suite against a real throwaway
 * Postgres instead.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

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
  /** Runs `fn` as `authenticated` with `userId` pinned, exactly like production. */
  asUser: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>;
  /** Bypasses RLS. Only for arranging fixtures, never for assertions about access. */
  asService: <T>(fn: (db: Database) => Promise<T>) => Promise<T>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

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

async function readMigrations(): Promise<{ name: string; statements: string[] }[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

  const migrations = [];
  for (const file of files) {
    const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    // drizzle-kit separates statements with this marker in generated files.
    const normalised = raw.replaceAll('--> statement-breakpoint', '');
    migrations.push({ name: file, statements: splitSqlStatements(normalised) });
  }
  return migrations;
}

let cachedMigrations: { name: string; statements: string[] }[] | null = null;

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;

  cachedMigrations ??= await readMigrations();

  for (const migration of cachedMigrations) {
    for (const statement of migration.statements) {
      try {
        await client.exec(statement);
      } catch (error) {
        throw new Error(
          `Migration ${migration.name} failed on statement:\n${statement.slice(0, 400)}\n\n${String(error)}`,
        );
      }
    }
  }

  const asUser = async <T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.execute(sql`set local role authenticated`);
      return fn(tx as Transaction);
    });

  const asService = async <T>(fn: (database: Database) => Promise<T>): Promise<T> => fn(db);

  const reset = async (): Promise<void> => {
    // Truncating rather than recreating keeps the suite fast; RESTART IDENTITY
    // is unnecessary because every primary key is a UUID.
    await client.exec(`
      DO $$
      DECLARE stmt text;
      BEGIN
        SELECT string_agg(format('TRUNCATE TABLE public.%I CASCADE', tablename), '; ')
        INTO stmt
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations';
        IF stmt IS NOT NULL THEN EXECUTE stmt; END IF;
      END
      $$;
    `);
  };

  const close = async (): Promise<void> => {
    await client.close();
  };

  return { db, asUser, asService, reset, close };
}
