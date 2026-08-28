import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { coerceBusinessDate, todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  countEmployees,
  findEmployeeById,
  findEmployeeByLinkedUserId,
  insertEmployee,
  listActiveOrgMembersForLinking,
  listEmployees,
  listLinkedEmployeeUserIds,
  updateEmployeeById,
  type OrgMemberLinkOption,
} from '../data/employees.repository';
import {
  insertLaborCostComponent,
  insertRateVersion,
  listRateVersionsByEmployee,
  updateRateVersionValidFrom,
} from '../data/rate-versions.repository';
import {
  canRealignInitialCompensationValidFrom,
  resolveInitialCompensationValidFrom,
} from '../domain/employment-compensation';
import type { EmployeeListItem, EmployeeRecord, RateVersionRecord } from '../domain/types';
import {
  buildEmployeeArchivePatch,
  buildEmployeeRestorePatch,
} from '../domain/soft-archive';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '../validation/schemas';
import {
  assertCanManageWorkforceCost,
  canReadWorkforceCost,
} from './workforce-cost-authz';
import { reconcileMissingTimeEntryCosts } from './time-entry-cost-reconcile';

export interface EmployeeDetail extends EmployeeRecord {
  readonly rateVersions: readonly RateVersionRecord[];
}

function redactListRates(items: readonly EmployeeListItem[]): EmployeeListItem[] {
  return items.map((item) => ({
    ...item,
    currentRate: null,
    currentRateUnit: null,
    currentRateCurrency: null,
    currentEmployerCost: null,
  }));
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

async function assertUserLinkAllowed(
  context: OrgContext,
  userId: string | null | undefined,
  exceptEmployeeId?: string,
): Promise<void> {
  if (!userId) return;

  const members = await listActiveOrgMembersForLinking(context.db, context.organizationId);
  if (!members.some((member) => member.userId === userId)) {
    throw new DomainRuleError(
      'User is not an active member of this organization',
      'workforce.errors.userNotInOrganization',
    );
  }

  const taken = await findEmployeeByLinkedUserId(
    context.db,
    context.organizationId,
    userId,
    exceptEmployeeId,
  );
  if (taken) {
    throw new DomainRuleError(
      'This login is already linked to another employee',
      'workforce.errors.userAlreadyLinked',
    );
  }
}

/**
 * When Owner sets employment start and the employee still has only the initial
 * open salary version, move that version's effective date to hireDate.
 * Does not invent dates and does not rewrite multi-version salary history.
 */
export async function alignInitialCompensationToHireDate(
  context: OrgContext,
  employeeId: string,
  hireDate: string,
): Promise<{ readonly aligned: boolean; readonly previousValidFrom: string | null }> {
  const hire = coerceBusinessDate(hireDate);
  const versions = await listRateVersionsByEmployee(context.db, context.organizationId, employeeId);
  const target = canRealignInitialCompensationValidFrom(versions, hire);
  if (!target) {
    return { aligned: false, previousValidFrom: null };
  }

  const updated = await updateRateVersionValidFrom(context.db, {
    organizationId: context.organizationId,
    rateVersionId: target.rateVersionId,
    validFrom: hire,
  });
  if (!updated) {
    return { aligned: false, previousValidFrom: target.previousValidFrom };
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RATE_VERSION_CREATED,
    entityType: 'rate_version',
    entityId: updated.id,
    before: { validFrom: target.previousValidFrom },
    after: {
      validFrom: hire,
      alignedToHireDate: true,
      employeeId,
    },
  });

  await reconcileMissingTimeEntryCosts(context, { employeeId });

  return { aligned: true, previousValidFrom: target.previousValidFrom };
}

/** Org members not already linked to another employee. Current link stays selectable. */
export async function listLinkableOrgMembers(
  context: OrgContext,
  options: { readonly exceptEmployeeId?: string } = {},
): Promise<OrgMemberLinkOption[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
  const [members, linked] = await Promise.all([
    listActiveOrgMembersForLinking(context.db, context.organizationId),
    listLinkedEmployeeUserIds(context.db, context.organizationId, options.exceptEmployeeId),
  ]);
  return members.filter((member) => !linked.has(member.userId));
}

export async function listEmployeesForOrg(
  context: OrgContext,
  filters: { search?: string; status?: EmployeeRecord['status'] | 'all' } = {},
): Promise<EmployeeListItem[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  const asOfDate = todayInTimeZone(context.organization.timezone);
  const items = await listEmployees(context.db, context.organizationId, {
    ...filters,
    asOfDate,
  });
  return canReadWorkforceCost(context) ? items : redactListRates(items);
}

export async function getEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<EmployeeDetail> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);

  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');

  const rateVersions = canReadWorkforceCost(context)
    ? await listRateVersionsByEmployee(context.db, context.organizationId, employeeId)
    : [];

  return { ...employee, rateVersions };
}

export async function createEmployee(
  context: OrgContext,
  rawInput: CreateEmployeeInput,
): Promise<EmployeeDetail> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = createEmployeeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.baseRate) {
    assertCanManageWorkforceCost(context);
  }
  await assertUserLinkAllowed(context, input.userId);
  const currency = (input.currency ?? context.organization.baseCurrency).toUpperCase();
  const hireDate = input.hireDate ? coerceBusinessDate(input.hireDate) : null;
  const validFrom =
    resolveInitialCompensationValidFrom({
      hireDate,
      explicitValidFrom: input.validFrom,
    }) ?? todayInTimeZone(context.organization.timezone);

  const standardHours =
    input.standardHoursPerDay === '' || input.standardHoursPerDay === undefined
      ? null
      : input.standardHoursPerDay;

  let employee;
  try {
    employee = await insertEmployee(context.db, {
      organizationId: context.organizationId,
      name: input.name,
      status: input.status,
      userId: input.userId ?? null,
      employeeNumber: input.employeeNumber ?? null,
      jobTitle: input.jobTitle ?? null,
      email: input.email || null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      hireDate,
      endDate: input.endDate ? coerceBusinessDate(input.endDate) : null,
      employmentBasis: input.baseRate ? input.rateUnit : null,
      standardHoursPerDay: standardHours,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainRuleError(
        'This login is already linked to another employee',
        'workforce.errors.userAlreadyLinked',
      );
    }
    throw error;
  }

  if (input.baseRate) {
    const { getLaborCostDefaultsForApply } = await import(
      '@/modules/tenancy/application/labor-cost-defaults'
    );
    const defaults = await getLaborCostDefaultsForApply(context).catch(() => null);
    const burdenPercent = input.burdenPercent ?? defaults?.burdenPercent ?? null;
    const components =
      input.components && input.components.length > 0
        ? input.components
        : (defaults?.components ?? []).map((component) => ({
            key: component.key,
            label: component.key,
            basis: (component.basis === 'fixed' ? 'amount' : component.basis) as
              | 'amount'
              | 'percent',
            amount: component.amount,
            percent: component.percent,
            currency,
          }));

    const rateVersion = await insertRateVersion(context.db, {
      organizationId: context.organizationId,
      employeeId: employee.id,
      validFrom,
      baseRate: input.baseRate,
      rateUnit: input.rateUnit,
      currency,
      burdenPercent,
      workingDaysPerMonth:
        input.rateUnit === 'monthly'
          ? input.workingDaysPerMonth?.trim() || defaults?.workingDaysPerMonth || null
          : null,
    });

    for (const component of components) {
      await insertLaborCostComponent(context.db, {
        organizationId: context.organizationId,
        rateVersionId: rateVersion.id,
        key: component.key,
        label: component.label,
        basis: component.basis,
        amount: component.amount ?? null,
        percent: component.percent ?? null,
        currency: component.currency?.toUpperCase() ?? currency,
      });
    }
  }

  const wasFirst = (await countEmployees(context.db, context.organizationId)) === 1;
  if (wasFirst) {
    await noteModuleUsage(context.db, context.organizationId, 'workforce');
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
    entityType: 'employee',
    entityId: employee.id,
    after: {
      name: employee.name,
      hireDate,
      rateUnit: input.rateUnit,
      ...(input.baseRate ? { baseRate: input.baseRate, currency, validFrom } : {}),
    },
  });

  return getEmployee(context, employee.id);
}

export async function updateEmployee(
  context: OrgContext,
  employeeId: string,
  rawInput: UpdateEmployeeInput,
): Promise<EmployeeRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const parsed = updateEmployeeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!existing) throw new NotFoundError('Employee');

  const input = parsed.data;
  if (input.userId !== undefined) {
    await assertUserLinkAllowed(context, input.userId, employeeId);
  }

  const nextHireDate =
    input.hireDate === undefined
      ? undefined
      : input.hireDate
        ? coerceBusinessDate(input.hireDate)
        : null;
  const nextEndDate =
    input.endDate === undefined
      ? undefined
      : input.endDate
        ? coerceBusinessDate(input.endDate)
        : null;

  let updated;
  try {
    updated = await updateEmployeeById(context.db, context.organizationId, employeeId, {
      name: input.name,
      status: input.status,
      userId: input.userId,
      employeeNumber: input.employeeNumber,
      jobTitle: input.jobTitle,
      email: input.email || null,
      phone: input.phone,
      notes: input.notes,
      ...(nextHireDate !== undefined ? { hireDate: nextHireDate } : {}),
      ...(nextEndDate !== undefined ? { endDate: nextEndDate } : {}),
      standardHoursPerDay:
        input.standardHoursPerDay === '' || input.standardHoursPerDay === undefined
          ? undefined
          : input.standardHoursPerDay,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainRuleError(
        'This login is already linked to another employee',
        'workforce.errors.userAlreadyLinked',
      );
    }
    throw error;
  }

  if (!updated) throw new NotFoundError('Employee');

  if (nextHireDate) {
    await alignInitialCompensationToHireDate(context, employeeId, nextHireDate);
  } else if (updated.standardHoursPerDay !== existing.standardHoursPerDay) {
    await reconcileMissingTimeEntryCosts(context, { employeeId });
  }

  // Hire/end corrections refresh open-period monthly allocation (no bootstrap).
  if (
    nextHireDate !== undefined ||
    nextEndDate !== undefined ||
    updated.hireDate !== existing.hireDate ||
    updated.endDate !== existing.endDate
  ) {
    const { recomputeOpenMonthsAfterCompensationChange } = await import(
      './monthly-cost-recompute'
    );
    await recomputeOpenMonthsAfterCompensationChange(context, employeeId);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
    entityType: 'employee',
    entityId: employeeId,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function archiveEmployee(context: OrgContext, employeeId: string): Promise<EmployeeRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const existing = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!existing) throw new NotFoundError('Employee');

  const updated = await updateEmployeeById(
    context.db,
    context.organizationId,
    employeeId,
    buildEmployeeArchivePatch(),
  );

  if (!updated) throw new NotFoundError('Employee');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_ARCHIVED,
    entityType: 'employee',
    entityId: employeeId,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function restoreEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<EmployeeRecord> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const existing = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!existing) throw new NotFoundError('Employee');

  const updated = await updateEmployeeById(
    context.db,
    context.organizationId,
    employeeId,
    buildEmployeeRestorePatch(),
  );

  if (!updated) throw new NotFoundError('Employee');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_RESTORED,
    entityType: 'employee',
    entityId: employeeId,
    before: existing,
    after: updated,
  });

  return updated;
}
