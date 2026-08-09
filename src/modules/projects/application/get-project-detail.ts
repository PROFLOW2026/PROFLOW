import { eq } from 'drizzle-orm';
import { clients, projectDomains } from '@drizzle/schema';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { computeCurrentContractValue } from '../domain/contract-value';
import { countActiveWorkPackages, shouldShowWorkPackages } from '../domain/work-package-visibility';
import type {
  ContractRecord,
  ContractValueEventRecord,
  PhaseRecord,
  ProjectRecord,
  WorkPackageRecord,
} from '../domain/types';
import {
  findPrimaryContractByProject,
  listContractValueEvents,
} from '../data/contracts.repository';
import { findProjectById } from '../data/projects.repository';
import { listPhasesByProject } from '../data/phases.repository';
import { listWorkPackagesByProject } from '../data/work-packages.repository';
import { fromNumericString, type MoneyValue } from '@/shared/money';

export interface ProjectDetail {
  readonly project: ProjectRecord;
  readonly clientName: string | null;
  readonly domainName: string | null;
  readonly workPackages: readonly WorkPackageRecord[];
  readonly phases: readonly PhaseRecord[];
  readonly showWorkPackages: boolean;
  readonly contract: ContractRecord | null;
  readonly contractValueEvents: readonly ContractValueEventRecord[];
  readonly currentContractValue: MoneyValue | null;
}

export async function getProjectDetail(
  context: OrgContext,
  projectId: string,
): Promise<ProjectDetail> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  let clientName: string | null = null;
  if (project.clientId) {
    const [client] = await context.db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, project.clientId))
      .limit(1);
    clientName = client?.name ?? null;
  }

  const [domain] = await context.db
    .select({ adHocName: projectDomains.adHocName })
    .from(projectDomains)
    .where(eq(projectDomains.projectId, projectId))
    .limit(1);

  const workPackages = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    projectId,
  );
  const phases = await listPhasesByProject(context.db, context.organizationId, projectId);

  let contract: ContractRecord | null = null;
  let contractValueEvents: ContractValueEventRecord[] = [];
  let currentContractValue: MoneyValue | null = null;

  if (context.permissions.has(PERMISSIONS.CONTRACTS_READ)) {
    contract = await findPrimaryContractByProject(context.db, context.organizationId, projectId);
    if (contract) {
      contractValueEvents = await listContractValueEvents(
        context.db,
        context.organizationId,
        contract.id,
      );
      currentContractValue = computeCurrentContractValue(contractValueEvents, contract.currency);
    } else if (project.currency) {
      currentContractValue = fromNumericString('0', project.currency);
    }
  }

  return {
    project,
    clientName,
    domainName: domain?.adHocName ?? null,
    workPackages,
    phases,
    showWorkPackages: shouldShowWorkPackages(countActiveWorkPackages(workPackages)),
    contract,
    contractValueEvents,
    currentContractValue,
  };
}
