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

export async function procurementScenario(database: TestDatabase) {
  const { orgA, userA } = await provisionTwoTenants(database);
  const orgId = orgA.organization.id;
  const projectId = await createProjectAs(database, userA.id, orgId, 'Tower Q');
  const contractorA = await createContractor(database, {
    organizationId: orgId,
    projectId,
    label: 'qA',
    withAgreement: false,
    capabilities: ['ext.bid.submit', 'ext.handover.submit', 'ext.project.view'],
  });
  const contractorB = await createContractor(database, {
    organizationId: orgId,
    projectId,
    label: 'qB',
    withAgreement: false,
    capabilities: ['ext.bid.submit', 'ext.handover.submit', 'ext.project.view'],
  });
  const pmFull = await addOrgMember(database, orgId, 'pm-full-q');
  await database.asUser(userA.id, async (tx) => {
    const context = await orgContextFor(tx, userA.id, orgId);
    await addProjectMember(context, { projectId, userId: pmFull.id, templateKey: 'project_manager_full' });
  });
  return { orgId, owner: userA, projectId, contractorA, contractorB, pmFull };
}

export function asInternal<T>(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  fn: (context: OrgContext, tx: Transaction) => Promise<T>,
): Promise<T> {
  return database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, organizationId), tx));
}

export async function asExternal<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
  fn: (context: ExternalContext, tx: Transaction) => Promise<T>,
): Promise<T> {
  const template = await externalContextFor(database, database.db as unknown as Transaction, contractor, organizationId);
  return database.asUser(contractor.authUser.id, async (tx) => fn({ ...template, db: tx }, tx));
}
