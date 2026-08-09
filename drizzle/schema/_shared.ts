import { sql } from 'drizzle-orm';
import { char, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Column builders shared by every table (doc 72 §1).
 *
 * Keeping these in one place is what makes the tenancy and money conventions
 * mechanically enforceable instead of a review checklist.
 */

/** UUID primary key. */
export const primaryId = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Soft delete (doc 65 I1). Archived rows stay tenant-scoped and keep their
 * history; application queries filter `archivedAt IS NULL` by default.
 */
export const archivedAt = () => timestamp('archived_at', { withTimezone: true, mode: 'date' });

/**
 * Money is stored as an exact decimal plus its ISO currency. `mode: 'string'`
 * keeps values out of JS floats on the way in and out of Postgres.
 */
export const moneyAmount = (name: string) => numeric(name, { precision: 18, scale: 6, mode: 'string' });

export const currencyCode = (name = 'currency') => char(name, { length: 3 });

/** Quantities keep the entered unit intact (doc 65 G2). */
export const quantityAmount = (name: string) => numeric(name, { precision: 18, scale: 6, mode: 'string' });

/** Percentages such as burden or allocation share: 17.5 means 17.5%. */
export const percentAmount = (name: string) => numeric(name, { precision: 9, scale: 6, mode: 'string' });
