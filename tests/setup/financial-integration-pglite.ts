import { sql } from 'drizzle-orm';
import { projects, workPackages } from '@drizzle/schema';
import type { Transaction } from '@/shared/db/types';
import { resultRows, type TestDatabase } from './database';
import {
  applyPendingJournalMigrations,
  GATE_A_FIN_INTEGRATION_PREPARED,
} from './pending-journal-migrations';

const ILS = 'ILS';

/** Pending journal SQL required for F03/F04/F14 financial integration on PGlite. */
export async function applyGateAFinancialIntegrationMigrations(
  database: TestDatabase,
): Promise<void> {
  await applyPendingJournalMigrations(database, GATE_A_FIN_INTEGRATION_PREPARED);
}

/**
 * Inserts a minimal project when Drizzle schema outpaces the PGlite snapshot
 * (or after {@link applyGateAFinancialIntegrationMigrations} when drizzle insert is preferred).
 */
export async function insertMinimalProject(
  tx: Transaction,
  organizationId: string,
  name: string,
): Promise<string> {
  const rows = resultRows<{ id: string }>(
    await tx.execute(sql`
      INSERT INTO projects (organization_id, name, status, currency)
      VALUES (${organizationId}::uuid, ${name}, 'active', ${ILS})
      RETURNING id
    `),
  );
  const projectId = rows[0]!.id;
  await tx.execute(sql`
    INSERT INTO work_packages (organization_id, project_id, name, is_default, sort_order)
    VALUES (${organizationId}::uuid, ${projectId}::uuid, 'General', true, 0)
  `);
  return projectId;
}

/** Creates project + default work package via Drizzle (requires 0191 parity on PGlite). */
export async function createProjectWithDefaultPackage(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  name: string,
): Promise<string> {
  return database.asUser(userId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ organizationId, name, status: 'active', currency: ILS })
      .returning({ id: projects.id });
    await tx.insert(workPackages).values({
      organizationId,
      projectId: project!.id,
      name: 'General',
      isDefault: true,
      sortOrder: 0,
    });
    return project!.id;
  });
}
