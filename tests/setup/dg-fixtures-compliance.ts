import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { tasks, workspaces } from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import type { Transaction } from '@/shared/db/types';
import { provisionTwoTenants } from '../integration/projects/setup';
import type { TestDatabase } from './database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  externalContextFor,
  orgContextFor,
  type ContractorFixture,
} from './dg-fixtures';

/** Track P fixtures: one project, two contractors (A/B) with agreements, an operational PM and an outsider. */
export async function complianceScenario(database: TestDatabase) {
  const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
  const orgId = orgA.organization.id;
  const projectId = await createProjectAs(database, userA.id, orgId, 'Tower P');
  const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other P');
  const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'pA' });
  const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'pB' });
  const pmOps = await addOrgMember(database, orgId, 'pm-ops-p');
  const safetyLead = await addOrgMember(database, orgId, 'safety-p');
  const outsider = await addOrgMember(database, orgId, 'outsider-p');
  await database.asUser(userA.id, async (tx) => {
    const context = await orgContextFor(tx, userA.id, orgId);
    await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
    await addProjectMember(context, { projectId, userId: safetyLead.id, templateKey: 'safety_manager' });
  });
  return {
    orgId,
    owner: userA,
    otherOrgId: orgB.organization.id,
    otherOwner: userB,
    projectId,
    otherProjectId,
    contractorA,
    contractorB,
    pmOps,
    safetyLead,
    outsider,
  };
}

export function asInternal<T>(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  fn: (context: OrgContext, tx: Transaction) => Promise<T>,
): Promise<T> {
  return database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, organizationId), tx));
}

/**
 * Builds the ExternalContext BEFORE opening the contractor transaction: the shared
 * `externalContextFor` reads grants as service role, which deadlocks the single PGlite
 * connection when called inside an open `asUser` transaction.
 */
export async function asExternal<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
  fn: (context: ExternalContext, tx: Transaction) => Promise<T>,
): Promise<T> {
  const template = await externalContextFor(database, database.db as unknown as Transaction, contractor, organizationId);
  return database.asUser(contractor.authUser.id, async (tx) => fn({ ...template, db: tx }, tx));
}

/** Real task row (service role) standing in for Track G's createLinkedTask in tests. */
export async function insertStandInTask(
  database: TestDatabase,
  organizationId: string,
  title: string,
): Promise<string> {
  return database.asService(async (db) => {
    let [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId))
      .limit(1);
    if (!workspace) {
      [workspace] = await db
        .insert(workspaces)
        .values({ organizationId, name: `WS ${randomUUID().slice(0, 4)}` } as typeof workspaces.$inferInsert)
        .returning({ id: workspaces.id });
    }
    const [task] = await db
      .insert(tasks)
      .values({
        organizationId,
        workspaceId: workspace!.id,
        title,
        createdBySystem: true,
        sortKey: 'a0',
      } as typeof tasks.$inferInsert)
      .returning({ id: tasks.id });
    return task!.id;
  });
}
