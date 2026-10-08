import 'server-only';
import { sql } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';
import {
  isTabProfilingEnabled,
  profileTxEnd,
  profileTxStart,
} from '@/shared/perf/tab-profile';
import { flushProfileQueryStarts, profileQueryStart } from '@/shared/db/profile-sql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@drizzle/schema';
import { serverEnv } from '@/shared/env/server';
import type { DbExecutor } from './types';

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
  globalThis.__projectflowSql ??= createSqlClient(connectionString);
  return globalThis.__projectflowSql;
}

function rawAdminSql(): postgres.Sql {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseNotConfiguredError();
  globalThis.__projectflowAdminSql ??= createSqlClient(connectionString);
  return globalThis.__projectflowAdminSql;
}

type TransactionCapableDb = DbExecutor & {
  transaction: <T>(fn: (tx: DbExecutor) => Promise<T>) => Promise<T>;
};

function asTransactionCapable(db: DbExecutor): TransactionCapableDb {
  return db as TransactionCapableDb;
}

export function getDb(): DbExecutor {
  const logger = isTabProfilingEnabled()
    ? {
        logQuery(query: string) {
          profileQueryStart(query.replace(/\s+/g, ' ').trim().slice(0, 140));
        },
      }
    : undefined;
  return drizzle(rawSql(), { schema, casing: 'snake_case', logger }) as unknown as DbExecutor;
}

export function getAdminDb(): DbExecutor {
  return drizzle(rawAdminSql(), { schema, casing: 'snake_case' }) as unknown as DbExecutor;
}

export async function withUserContext<T>(
  userId: string,
  fn: (tx: DbExecutor) => Promise<T>,
  db: DbExecutor = getDb(),
): Promise<T> {
  const profile = isTabProfilingEnabled();
  const txLabel = `user:${userId.slice(0, 8)}`;
  const t0 = profile ? performance.now() : 0;
  if (profile) profileTxStart(txLabel);

  try {
    return await asTransactionCapable(db).transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.execute(sql`set local role authenticated`);
      const result = await fn(tx);
      if (profile) profileTxEnd(txLabel, Math.round(performance.now() - t0));
      return result;
    });
  } finally {
    if (profile) flushProfileQueryStarts();
  }
}

export async function withTransaction<T>(
  executor: DbExecutor,
  fn: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return asTransactionCapable(executor).transaction(async (tx) => fn(tx));
}
