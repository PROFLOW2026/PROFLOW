import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from '@drizzle/schema';

/**
 * Driver-agnostic database handles.
 *
 * Repositories accept these types rather than importing a concrete client, so
 * the same code runs against Supabase Postgres in production and against an
 * in-process PGlite instance in the integration tests — including the RLS
 * policies, which is the whole point.
 */

export type AppSchema = typeof schema;
export type AppRelations = ExtractTablesWithRelations<AppSchema>;

export type Database = PgDatabase<PgQueryResultHKT, AppSchema, AppRelations>;

export type Transaction = PgTransaction<PgQueryResultHKT, AppSchema, AppRelations>;

/** Anything a repository can run against: the pool or an open transaction. */
export type DbExecutor = Database | Transaction;
