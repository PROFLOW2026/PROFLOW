import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  countEmployees,
  findEmployeeById,
  insertEmployee,
  listEmployees,
  updateEmployeeById,
} from '../data/employees.repository';
import {
  insertLaborCostComponent,
  insertRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
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

export interface EmployeeDetail extends EmployeeRecord {
  readonly rateVersions: readonly RateVersionRecord[];
}

function redactListRates(items: readonly EmployeeListItem[]): EmployeeListItem[] {
  return items.map((item) => ({
    ...item,
    currentRate: null,
    currentRateUnit: null,
    currentRateCurrency: null,
  }));
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

  // Compensation history is private employer cost — not unlocked by workforce.read.
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
  const currency = (input.currency ?? context.organization.baseCurrency).toUpperCase();
  const validFrom = input.validFrom ?? todayInTimeZone(context.organization.timezone);

  const employee = await insertEmployee(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    status: input.status,
    userId: input.userId ?? null,
    employeeNumber: input.employeeNumber ?? null,
    jobTitle: input.jobTitle ?? null,
    email: input.email || null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
  });

  if (input.baseRate) {
    const { getLaborCostDefaultsForApply } = await import(
      '@/modules/tenancy/application/labor-cost-defaults'
    );
    const defaults = await getLaborCostDefaultsForApply(context).catch(() => null);
    const burdenPercent =
      input.burdenPercent ?? defaults?.burdenPercent ?? null;
    const components =
      input.components && input.components.length > 0
        ? input.components
        : (defaults?.components ?? []).map((component) => ({
            key: component.key,
            label: component.key,
            // Org defaults use `fixed`; workforce components store fixed amounts as `amount`.
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
      rateUnit: input.rateUnit,
      ...(input.baseRate ? { baseRate: input.baseRate, currency } : {}),
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
  const updated = await updateEmployeeById(context.db, context.organizationId, employeeId, {
    name: input.name,
    status: input.status,
    userId: input.userId,
    employeeNumber: input.employeeNumber,
    jobTitle: input.jobTitle,
    email: input.email || null,
    phone: input.phone,
    notes: input.notes,
  });

  if (!updated) throw new NotFoundError('Employee');

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
