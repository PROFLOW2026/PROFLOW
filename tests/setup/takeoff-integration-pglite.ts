import { createTestDatabase, type TestDatabase } from './database';
import {
  applyPendingJournalMigrations,
  ELECTRICAL_TAKEOFF_PG_LITE_PENDING,
  ELECTRICAL_TAKEOFF_PREPARED,
} from './pending-journal-migrations';

/** PGlite DB with takeoff pending journal SQL (0207+; full stack use {@link ELECTRICAL_TAKEOFF_PREPARED} on throwaway Postgres). */
export async function createTakeoffTestDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  await applyPendingJournalMigrations(database, ELECTRICAL_TAKEOFF_PG_LITE_PENDING);
  return database;
}

/** Applies full 0205–0207 on a disposable DB that predates the takeoff journal entries. */
export async function applyFullTakeoffPreparedMigrations(database: TestDatabase): Promise<void> {
  await applyPendingJournalMigrations(database, ELECTRICAL_TAKEOFF_PREPARED);
}