import 'server-only';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@drizzle/schema';
import { serverEnv } from '@/shared/env/server';
import type { Database, DbExecutor, Transaction } from './types';

/**
 * Runtime database access (doc 74 §2).
 *
 * Two distinct connections, deliberately not interchangeable:
 *
 *  - the request connection runs as the `authenticated` role with the acting
 *    user pinned into the transaction, so every RLS policy applies;
 *  - the admin connection is reserved for migrations, controlled system seeds
 *    and explicitly org-targeted jobs. It never serves a browser request.
 */

declare global {
   
  var __projectflowSql: postgres.Sql | undefined;
   
  var __projectflowAdminSql: postgres.Sql | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not configured. Copy .env.example to .env.local and point it at a non-production database.',
    );
    this.name = 'DatabaseNotConfiguredError';
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createSqlClient(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    // Serverless functions get many short-lived instances; a small pool per
    // instance avoids exhausting the Supabase pooler.
    max: serverEnv().DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });
}

function rawSql(): postgres.Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseNotConfiguredError();
  // Reused across hot reloads in development so `next dev` does not leak pools.
  globalThis.__projectflowSql ??= createSqlClient(connectionString);
  return globalThis.__projectflowSql;
}

function rawAdminSql(): postgres.Sql {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseNotConfiguredError();
  globalThis.__projectflowAdminSql ??= createSqlClient(connectionString);
  return globalThis.__projectflowAdminSql;
}

/**
 * Connection pool for ordinary requests. Callers should almost always go
 * through `withUserContext` instead so RLS has an identity to work with.
 */
export function getDb(): Database {
  return drizzle(rawSql(), { schema, casing: 'snake_case' }) as unknown as Database;
}

/**
 * Elevated handle. Every call site must be able to justify why RLS is bypassed
 * and must target an explicit organization (doc 74 §4).
 */
export function getAdminDb(): Database {
  return drizzle(rawAdminSql(), { schema, casing: 'snake_case' }) as unknown as Database;
}

/**
 * Runs `fn` inside a transaction that is bound to `userId`.
 *
 * `SET LOCAL` is transaction-scoped, so a pooled connection returned to the
 * pool cannot carry one request's identity into the next. The role switch means
 * the statements inside are subject to the same policies a Supabase client
 * would face.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as Transaction);
  });
}

/** Groups several repository calls into one atomic unit. */
export async function withTransaction<T>(
  executor: DbExecutor,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return (executor as Database).transaction(async (tx) => fn(tx as Transaction));
}
