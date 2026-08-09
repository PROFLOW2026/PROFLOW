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
import {
  countActiveWorkPackagesByProject,
  listWorkPackagesByProject,
} from '../data/work-packages.repository';
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

export interface GetProjectDetailOptions {
  /**
   * When false, skip work-package / phase / milestone rows (empty arrays) and
   * resolve `showWorkPackages` via an active-package count. Use for module tabs
   * that only need project chrome + contract value.
   */
  includeStructure?: boolean;
}

export async function getProjectDetail(
  context: OrgContext,
  projectId: string,
  options: GetProjectDetailOptions = {},
): Promise<ProjectDetail> {
  const includeStructure = options.includeStructure !== false;
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);

  // Resolve contract before the parallel batch so value events can run alongside
  // structure / chrome lookups instead of waiting on them.
  const contract = canReadContracts
    ? await findPrimaryContractByProject(context.db, context.organizationId, projectId)
    : null;

  const [clientName, domainName, structure, contractValueEvents] = await Promise.all([
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
    includeStructure
      ? Promise.all([
          listWorkPackagesByProject(context.db, context.organizationId, projectId),
          listPhasesByProject(context.db, context.organizationId, projectId),
          listMilestonesByProject(context.db, context.organizationId, projectId),
        ]).then(([workPackages, phases, milestones]) => ({
          workPackages,
          phases,
          milestones,
          activeCount: countActiveWorkPackages(workPackages),
        }))
      : countActiveWorkPackagesByProject(context.db, context.organizationId, projectId).then(
          (activeCount) => ({
            workPackages: [] as WorkPackageRecord[],
            phases: [] as PhaseRecord[],
            milestones: [] as MilestoneRecord[],
            activeCount,
          }),
        ),
    contract
      ? listContractValueEvents(context.db, context.organizationId, contract.id)
      : Promise.resolve([] as ContractValueEventRecord[]),
  ]);

  let currentContractValue: MoneyValue | null = null;
  let originalContractAmountLocked = false;

  if (canReadContracts) {
    if (contract) {
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
    workPackages: structure.workPackages,
    phases: structure.phases,
    milestones: structure.milestones,
    showWorkPackages: shouldShowWorkPackages(structure.activeCount),
    contract,
    contractValueEvents,
    currentContractValue,
    originalContractAmountLocked,
  };
}
