import { eq } from 'drizzle-orm';
import { clients, projectDomains } from '@drizzle/schema';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import {
  computeCurrentContractValue,
  isOriginalContractAmountLocked,
} from '../domain/contract-value';
import { countActiveWorkPackages, shouldShowWorkPackages } from '../domain/work-package-visibility';
import type {
  ContractRecord,
  ContractValueEventRecord,
  MilestoneRecord,
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
import { listMilestonesByProject } from '../data/milestones.repository';
import { listWorkPackagesByProject } from '../data/work-packages.repository';
import { fromNumericString, type MoneyValue } from '@/shared/money';

export interface ProjectDetail {
  readonly project: ProjectRecord;
  readonly clientName: string | null;
  readonly domainName: string | null;
  readonly workPackages: readonly WorkPackageRecord[];
  readonly phases: readonly PhaseRecord[];
  readonly milestones: readonly MilestoneRecord[];
  readonly showWorkPackages: boolean;
  readonly contract: ContractRecord | null;
  readonly contractValueEvents: readonly ContractValueEventRecord[];
  readonly currentContractValue: MoneyValue | null;
  /** True once a finalized contract-value change exists (approved CO / adjustment). */
  readonly originalContractAmountLocked: boolean;
}

export async function getProjectDetail(
  context: OrgContext,
  projectId: string,
): Promise<ProjectDetail> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);

  const [clientName, domainName, workPackages, phases, milestones, contract] = await Promise.all([
    project.clientId
      ? context.db
          .select({ name: clients.name })
          .from(clients)
          .where(eq(clients.id, project.clientId))
          .limit(1)
          .then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null),
    context.db
      .select({ adHocName: projectDomains.adHocName })
      .from(projectDomains)
      .where(eq(projectDomains.projectId, projectId))
      .limit(1)
      .then((rows) => rows[0]?.adHocName ?? null),
    listWorkPackagesByProject(context.db, context.organizationId, projectId),
    listPhasesByProject(context.db, context.organizationId, projectId),
    listMilestonesByProject(context.db, context.organizationId, projectId),
    canReadContracts
      ? findPrimaryContractByProject(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
  ]);

  let contractValueEvents: ContractValueEventRecord[] = [];
  let currentContractValue: MoneyValue | null = null;
  let originalContractAmountLocked = false;

  if (canReadContracts) {
    if (contract) {
      contractValueEvents = await listContractValueEvents(
        context.db,
        context.organizationId,
        contract.id,
      );
      currentContractValue = computeCurrentContractValue(contractValueEvents, contract.currency);
      originalContractAmountLocked = isOriginalContractAmountLocked(contractValueEvents);
    } else if (project.currency) {
      currentContractValue = fromNumericString('0', project.currency);
    }
  }

  return {
    project,
    clientName,
    domainName,
    workPackages,
    phases,
    milestones,
    showWorkPackages: shouldShowWorkPackages(countActiveWorkPackages(workPackages)),
    contract,
    contractValueEvents,
    currentContractValue,
    originalContractAmountLocked,
  };
}
