import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { toNumericString } from '@/shared/money';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { calculateLaborCostTotal } from '../domain/labor-cost';
import { resolveRateVersionForDate } from '../domain/rate-lookup';
import { DEFAULT_NON_PROJECT_TIME_CODES } from '../domain/types';
import { findEmployeeById, findEmployeeByUserId } from '../data/employees.repository';
import {
  findDefaultWorkPackage,
  findPhaseById,
  findProjectById,
  findWorkPackageById,
} from '../data/project-refs.repository';
import {
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import {
  countNonProjectTimeCodes,
  findNonProjectTimeCodeById,
  insertNonProjectTimeCode,
  insertTimeEntry,
  listNonProjectTimeCodes,
  listTimeEntries,
  sumProjectLaborCost,
} from '../data/time-entries.repository';
import type { NonProjectTimeCodeRecord, TimeEntryListItem, TimeEntryRecord } from '../domain/types';
import { createTimeEntrySchema, type CreateTimeEntryInput, type TimeEntryFiltersInput } from '../validation/schemas';

export interface CostSnapshot {
  readonly rateVersionId: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
}

/**
 * Resolves and calculates the labor cost snapshot for a time entry (doc 04 §13, doc 06 §5).
 * Returns null cost fields when no rate applies on the work date.
 */
export async function resolveTimeEntryCostSnapshot(
  db: OrgContext['db'],
  organizationId: string,
  input: { employeeId: string; workDate: string; hours: string },
): Promise<CostSnapshot> {
  const versions = await listRateVersionsByEmployee(db, organizationId, input.employeeId);
  const rateVersion = resolveRateVersionForDate(versions, businessDate(input.workDate));

  if (!rateVersion) {
    return { rateVersionId: null, costAmount: null, costCurrency: null };
  }

  const components = await listComponentsByRateVersion(db, organizationId, rateVersion.id);
  const total = calculateLaborCostTotal({
    baseRate: rateVersion.baseRate,
    currency: rateVersion.currency,
    rateUnit: rateVersion.rateUnit,
    hours: input.hours,
    burdenPercent: rateVersion.burdenPercent,
    components,
  });

  return {
    rateVersionId: rateVersion.id,
    costAmount: toNumericString(total),
    costCurrency: total.currency,
  };
}

async function ensureDefaultTimeCodes(db: OrgContext['db'], organizationId: string): Promise<void> {
  const count = await countNonProjectTimeCodes(db, organizationId);
  if (count > 0) return;

  for (const preset of DEFAULT_NON_PROJECT_TIME_CODES) {
    await insertNonProjectTimeCode(db, {
      organizationId,
      key: preset.key,
      name: preset.name,
    });
  }
}

export async function listNonProjectCodes(context: OrgContext): Promise<NonProjectTimeCodeRecord[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  await ensureDefaultTimeCodes(context.db, context.organizationId);
  return listNonProjectTimeCodes(context.db, context.organizationId);
}

export async function listTimeEntriesForOrg(
  context: OrgContext,
  filters: TimeEntryFiltersInput = {},
): Promise<TimeEntryListItem[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  return listTimeEntries(context.db, context.organizationId, {
    employeeId: filters.employeeId,
    projectId: filters.projectId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    kind: filters.kind ?? 'all',
  });
}

export async function listProjectTimeEntries(
  context: OrgContext,
  projectId: string,
): Promise<TimeEntryListItem[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]);
  return listTimeEntries(context.db, context.organizationId, { projectId, kind: 'project' });
}

export async function createTimeEntry(
  context: OrgContext,
  rawInput: CreateTimeEntryInput,
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = createTimeEntrySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  let projectId: string | null = null;
  let workPackageId: string | null = null;
  let phaseId: string | null = null;
  let timeCodeId: string | null = null;

  if (input.kind === 'project') {
    const project = await findProjectById(context.db, context.organizationId, input.projectId!);
    if (!project) throw new NotFoundError('Project');

    projectId = project.id;

    if (input.workPackageId) {
      const workPackage = await findWorkPackageById(context.db, context.organizationId, input.workPackageId);
      if (!workPackage || workPackage.projectId !== projectId) {
        throw new DomainRuleError('Work package does not belong to the project', 'workforce.errors.invalidWorkPackage');
      }
      workPackageId = workPackage.id;
    } else {
      const defaultPackage = await findDefaultWorkPackage(context.db, context.organizationId, projectId);
      workPackageId = defaultPackage?.id ?? null;
    }

    if (input.phaseId) {
      const phase = await findPhaseById(context.db, context.organizationId, input.phaseId);
      if (!phase || phase.projectId !== projectId) {
        throw new DomainRuleError('Phase does not belong to the project', 'workforce.errors.invalidPhase');
      }
      if (workPackageId && phase.workPackageId !== workPackageId) {
        throw new DomainRuleError('Phase does not belong to the work package', 'workforce.errors.invalidPhase');
      }
      phaseId = phase.id;
    }
  } else {
    await ensureDefaultTimeCodes(context.db, context.organizationId);
    const code = await findNonProjectTimeCodeById(context.db, context.organizationId, input.timeCodeId!);
    if (!code) throw new NotFoundError('Time code');
    timeCodeId = code.id;
  }

  const snapshot = await resolveTimeEntryCostSnapshot(context.db, context.organizationId, {
    employeeId: input.employeeId,
    workDate: input.workDate,
    hours: input.hours,
  });

  const entry = await insertTimeEntry(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    workDate: input.workDate,
    hours: input.hours,
    kind: input.kind,
    projectId,
    workPackageId,
    phaseId,
    timeCodeId,
    rateVersionId: snapshot.rateVersionId,
    costAmount: snapshot.costAmount,
    costCurrency: snapshot.costCurrency,
    description: input.description ?? null,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'workforce');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_CREATED,
    entityType: 'time_entry',
    entityId: entry.id,
    after: {
      employeeId: entry.employeeId,
      workDate: entry.workDate,
      hours: entry.hours,
      kind: entry.kind,
      projectId: entry.projectId,
      costAmount: entry.costAmount,
      costCurrency: entry.costCurrency,
      rateVersionId: entry.rateVersionId,
    },
  });

  return entry;
}

/** Suggested default employee when the signed-in user is linked to one. */
export async function suggestDefaultEmployee(context: OrgContext): Promise<string | null> {
  const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
  return linked?.id ?? null;
}

export { sumProjectLaborCost };
