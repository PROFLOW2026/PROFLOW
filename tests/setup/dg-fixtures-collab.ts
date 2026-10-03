import { addProjectMember } from '@/modules/project-team';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import type { TestDatabase } from './database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  externalContextFor,
  orgContextFor,
  type ContractorFixture,
} from './dg-fixtures';
import type { TestUser } from './fixtures';
import { provisionTwoTenants } from '../integration/projects/setup';

/** Track G fixtures: project with a task workspace, two contractors and capability-scoped members. */
export interface CollabScenario {
  readonly orgId: string;
  readonly owner: TestUser;
  readonly projectId: string;
  readonly contractorA: ContractorFixture;
  readonly contractorB: ContractorFixture;
  /** worker org role + `site_manager` project template (operational, no org task permissions). */
  readonly siteManager: TestUser;
  /** `project_manager_operational` (no financial capabilities). */
  readonly pmOps: TestUser;
  /** `project_accountant` (financial capabilities). */
  readonly accountant: TestUser;
}

export async function createCollabScenario(database: TestDatabase): Promise<CollabScenario> {
  const { orgA, userA } = await provisionTwoTenants(database);
  const orgId = orgA.organization.id;
  const projectId = await createProjectAs(database, userA.id, orgId, 'Tower A');
  const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
  const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
  const siteManager = await addOrgMember(database, orgId, 'site');
  const pmOps = await addOrgMember(database, orgId, 'pm-ops');
  const accountant = await addOrgMember(database, orgId, 'acct');
  await database.asUser(userA.id, async (tx) => {
    const context = await orgContextFor(tx, userA.id, orgId);
    await lazyCreateProjectWorkspace(context, projectId, 'Tower A');
    await addProjectMember(context, { projectId, userId: siteManager.id, templateKey: 'site_manager' });
    await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
    await addProjectMember(context, { projectId, userId: accountant.id, templateKey: 'project_accountant' });
  });
  return { orgId, owner: userA, projectId, contractorA, contractorB, siteManager, pmOps, accountant };
}

export function asInternal<T>(
  database: TestDatabase,
  user: TestUser,
  orgId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return database.asUser(user.id, async (tx) => fn(await orgContextFor(tx, user.id, orgId)));
}

/**
 * Grants are read (service role) BEFORE opening the contractor transaction: PGlite is a single
 * connection, so a service query issued while the RLS transaction is open would wait forever.
 */
export async function asContractor<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  orgId: string,
  fn: (context: ExternalContext) => Promise<T>,
): Promise<T> {
  const base = await externalContextFor(database, undefined as never, contractor, orgId);
  return database.asUser(contractor.authUser.id, async (tx) => fn({ ...base, db: tx }));
}
