import { eq } from 'drizzle-orm';
import { clients, projectDomains } from '@drizzle/schema';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { loadDisplayContactForProject } from '@/modules/clients';
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
  listContractsByProject,
  listContractValueEvents,
  listContractValueEventsForContracts,
} from '../data/contracts.repository';
import { findProjectById } from '../data/projects.repository';
import { assertCanAccessProject } from './project-access';
import { listPhasesByProject } from '../data/phases.repository';
import { listMilestonesByProject } from '../data/milestones.repository';
import {
  countActiveWorkPackagesByProject,
  listWorkPackagesByProject,
} from '../data/work-packages.repository';
import { fromNumericString, type MoneyValue } from '@/shared/money';

export interface ProjectClientContactSummary {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly role: string;
  /** True when sourced from projects.primary_contact_id (not client-wide fallback). */
  readonly isProjectSpecific: boolean;
}

export interface ProjectDetail {
  readonly project: ProjectRecord;
  readonly clientName: string | null;
  /**
   * Display contact: project primary_contact_id when set, else client practical primary.
   */
  readonly clientContact: ProjectClientContactSummary | null;
  readonly domainName: string | null;
  readonly workPackages: readonly WorkPackageRecord[];
  readonly phases: readonly PhaseRecord[];
  readonly milestones: readonly MilestoneRecord[];
  readonly showWorkPackages: boolean;
  readonly contract: ContractRecord | null;
  readonly contracts: readonly ContractRecord[];
  readonly contractValueEvents: readonly ContractValueEventRecord[];
  readonly currentContractValue: MoneyValue | null;
  /** True once a finalized contract-value change exists (approved CO / adjustment). */
  readonly originalContractAmountLocked: boolean;
}

/** Header / tab chrome - no work-package, phase, or milestone rows. */
export type ProjectDetailChrome = Omit<
  ProjectDetail,
  'workPackages' | 'phases' | 'milestones' | 'showWorkPackages'
>;

export interface ProjectDetailStructure {
  readonly workPackages: readonly WorkPackageRecord[];
  readonly phases: readonly PhaseRecord[];
  readonly milestones: readonly MilestoneRecord[];
  readonly activeCount: number;
}

export interface GetProjectDetailOptions {
  /**
   * When false, skip work-package / phase / milestone rows (empty arrays) and
   * resolve `showWorkPackages` via an active-package count. Use for module tabs
   * that only need project chrome + contract value.
   */
  includeStructure?: boolean;
}

/**
 * Stable project header fields shared by layout chrome and tab panels.
 * Request-scoped React `cache` in the route layer dedupes layout + page.
 */
export async function getProjectDetailChrome(
  context: OrgContext,
  projectId: string,
): Promise<ProjectDetailChrome> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);

  const canReadContracts = context.permissions.has(PERMISSIONS.CONTRACTS_READ);

  const projectContracts = canReadContracts
    ? await listContractsByProject(context.db, context.organizationId, projectId)
    : [];
  const contract =
    projectContracts.find((row) => row.isPrimary) ??
    (canReadContracts
      ? await findPrimaryContractByProject(context.db, context.organizationId, projectId)
      : null);

  const [clientName, clientContact, domainName, allContractEvents] = await Promise.all([
    project.clientId
      ? context.db
          .select({ name: clients.name })
          .from(clients)
          .where(eq(clients.id, project.clientId))
          .limit(1)
          .then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null),
    resolveDisplayContact(context, project),
    context.db
      .select({ adHocName: projectDomains.adHocName })
      .from(projectDomains)
      .where(eq(projectDomains.projectId, projectId))
      .limit(1)
      .then((rows) => rows[0]?.adHocName ?? null),
    projectContracts.length > 0
      ? listContractValueEventsForContracts(
          context.db,
          context.organizationId,
          projectContracts.map((row) => row.id),
        )
      : contract
        ? listContractValueEvents(context.db, context.organizationId, contract.id)
        : Promise.resolve([] as ContractValueEventRecord[]),
  ]);

  const contractValueEvents = contract
    ? allContractEvents.filter((event) => event.contractId === contract.id)
    : [];

  let currentContractValue: MoneyValue | null = null;
  let originalContractAmountLocked = false;

  if (canReadContracts) {
    const currency =
      contract?.currency ?? projectContracts[0]?.currency ?? project.currency ?? null;
    if (currency) {
      const sameCurrencyEvents = allContractEvents.filter(
        (event) => event.currency.toUpperCase() === currency.toUpperCase(),
      );
      currentContractValue =
        sameCurrencyEvents.length > 0
          ? computeCurrentContractValue(sameCurrencyEvents, currency)
          : fromNumericString(contract?.originalValueAmount ?? '0', currency);
      originalContractAmountLocked = isOriginalContractAmountLocked(contractValueEvents);
    }
  }

  return {
    project,
    clientName,
    clientContact,
    domainName,
    contract,
    contracts: projectContracts,
    contractValueEvents,
    currentContractValue,
    originalContractAmountLocked,
  };
}

/** Build overview chrome from a single commercial bundle (no duplicate contract/event reads). */
export function assembleProjectDetailChrome(input: {
  readonly project: ProjectRecord;
  readonly projectContracts: readonly ContractRecord[];
  readonly allContractEvents: readonly ContractValueEventRecord[];
  readonly canReadContracts: boolean;
}): ProjectDetailChrome {
  const { project, projectContracts, allContractEvents, canReadContracts } = input;
  const contract =
    projectContracts.find((row) => row.isPrimary) ?? projectContracts[0] ?? null;

  const contractValueEvents = contract
    ? allContractEvents.filter((event) => event.contractId === contract.id)
    : [];

  let currentContractValue: MoneyValue | null = null;
  let originalContractAmountLocked = false;

  if (canReadContracts) {
    const currency =
      contract?.currency ?? projectContracts[0]?.currency ?? project.currency ?? null;
    if (currency) {
      const sameCurrencyEvents = allContractEvents.filter(
        (event) => event.currency.toUpperCase() === currency.toUpperCase(),
      );
      currentContractValue =
        sameCurrencyEvents.length > 0
          ? computeCurrentContractValue(sameCurrencyEvents, currency)
          : fromNumericString(contract?.originalValueAmount ?? '0', currency);
      originalContractAmountLocked = isOriginalContractAmountLocked(contractValueEvents);
    }
  }

  return {
    project,
    clientName: null,
    clientContact: null,
    domainName: null,
    contract,
    contracts: projectContracts,
    contractValueEvents,
    currentContractValue,
    originalContractAmountLocked,
  };
}

export async function getProjectDetailStructure(
  context: OrgContext,
  projectId: string,
): Promise<ProjectDetailStructure> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const [workPackages, phases, milestones] = await Promise.all([
    listWorkPackagesByProject(context.db, context.organizationId, projectId),
    listPhasesByProject(context.db, context.organizationId, projectId),
    listMilestonesByProject(context.db, context.organizationId, projectId),
  ]);

  return {
    workPackages,
    phases,
    milestones,
    activeCount: countActiveWorkPackages(workPackages),
  };
}

export async function countProjectActiveWorkPackages(
  context: OrgContext,
  projectId: string,
): Promise<number> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  return countActiveWorkPackagesByProject(context.db, context.organizationId, projectId);
}

export function assembleProjectDetail(
  chrome: ProjectDetailChrome,
  structure: ProjectDetailStructure | null,
): ProjectDetail {
  if (structure) {
    return {
      ...chrome,
      workPackages: structure.workPackages,
      phases: structure.phases,
      milestones: structure.milestones,
      showWorkPackages: shouldShowWorkPackages(structure.activeCount),
    };
  }

  return {
    ...chrome,
    workPackages: [],
    phases: [],
    milestones: [],
    showWorkPackages: false,
  };
}

export async function getProjectDetail(
  context: OrgContext,
  projectId: string,
  options: GetProjectDetailOptions = {},
): Promise<ProjectDetail> {
  const includeStructure = options.includeStructure !== false;
  const chrome = await getProjectDetailChrome(context, projectId);

  if (includeStructure) {
    const structure = await getProjectDetailStructure(context, projectId);
    return assembleProjectDetail(chrome, structure);
  }

  const activeCount = await countProjectActiveWorkPackages(context, projectId);
  return assembleProjectDetail(chrome, {
    workPackages: [],
    phases: [],
    milestones: [],
    activeCount,
  });
}

async function resolveDisplayContact(
  context: OrgContext,
  project: ProjectRecord,
): Promise<ProjectClientContactSummary | null> {
  if (!project.clientId) return null;

  // PROJECTS_READ already gates chrome; do not require CLIENTS_READ (workers).
  const contact = await loadDisplayContactForProject(context, {
    clientId: project.clientId,
    primaryContactId: project.primaryContactId,
  });
  if (!contact) return null;

  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    role: contact.role,
    isProjectSpecific: Boolean(
      project.primaryContactId && contact.id === project.primaryContactId,
    ),
  };
}
