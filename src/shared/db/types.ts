import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';

/**
 * Lightweight SQL / query-builder executor for repositories.
 *
 * Does not import `@drizzle/schema` or `ExtractTablesWithRelations`. Table typing
 * comes from `@drizzle/schema` imports at each call site (`.from(organizations)`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- relational erasure for TSC graph only
type LiteRelationalConfig = any;

type LiteSchema = Record<string, unknown>;

export type DbExecutor =
  | PgDatabase<PgQueryResultHKT, LiteSchema, LiteRelationalConfig>
  | PgTransaction<PgQueryResultHKT, LiteSchema, LiteRelationalConfig>;
