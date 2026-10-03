import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { externalAccessGrants, tasks, workspaces } from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import type { TestDatabase } from './database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  orgContextFor,
  type ContractorFixture,
} from './dg-fixtures';
import type { TestUser } from './fixtures';
import { provisionTwoTenants } from '../integration/projects/setup';

/** Track O (field) scenario: owner, ops PM, foreman, outsider, contractors A/B on one project. */
export interface FieldScenario {
  readonly orgId: string;
  readonly owner: TestUser;
  readonly projectId: string;
  readonly otherProjectId: string;
  readonly pmOps: TestUser;
  readonly foreman: TestUser;
  readonly outsider: TestUser;
  readonly contractorA: ContractorFixture;
  readonly contractorB: ContractorFixture;
  readonly otherOrgId: string;
  readonly otherOwner: TestUser;
}

export async function seedFieldScenario(database: TestDatabase): Promise<FieldScenario> {
  const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
  const orgId = orgA.organization.id;
  const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
  const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other');
  const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
  const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
  const pmOps = await addOrgMember(database, orgId, 'pm-ops');
  const foreman = await addOrgMember(database, orgId, 'foreman');
  const outsider = await addOrgMember(database, orgId, 'outsider');
  await database.asUser(userA.id, async (tx) => {
    const context = await orgContextFor(tx, userA.id, orgId);
    await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
    await addProjectMember(context, { projectId, userId: foreman.id, templateKey: 'foreman' });
  });
  return {
    orgId,
    owner: userA,
    projectId,
    otherProjectId,
    pmOps,
    foreman,
    outsider,
    contractorA,
    contractorB,
    otherOrgId: orgB.organization.id,
    otherOwner: userB,
  };
}

/**
 * Runs `fn` as the contractor with an ExternalContext. Grants are read BEFORE the RLS transaction
 * opens: PGlite is single-connection, so a service query issued inside `asUser` would wait forever.
 */
export async function runAsContractor<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
  fn: (context: ExternalContext) => Promise<T>,
): Promise<T> {
  const rows = await database.asService((db) =>
    db
      .select()
      .from(externalAccessGrants)
      .where(
        and(
          eq(externalAccessGrants.principalId, contractor.principalId),
          eq(externalAccessGrants.organizationId, organizationId),
          eq(externalAccessGrants.status, 'active'),
        ),
      ),
  );
  const grants: ExternalGrantView[] = rows.map((row) => ({
    grantId: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId!,
    projectId: row.projectId,
    subcontractAgreementId: row.subcontractAgreementId,
    capabilities: new Set(row.scopes),
    expiresAt: row.expiresAt,
  }));
  return database.asUser(contractor.authUser.id, (tx) =>
    fn({
      principalId: contractor.principalId,
      authUserId: contractor.authUser.id,
      displayName: null,
      locale: 'en',
      grants,
      db: tx,
    }),
  );
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
        .values({ organizationId, name: `WS ${randomUUID().slice(0, 4)}`, workspaceType: 'org_internal' })
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
