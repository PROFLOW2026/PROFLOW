'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  applyMonthlyEmployerCostAllocation,
  archiveEmployee,
  createEmployee,
  createEmployeeSchema,
  createRateVersion,
  createRateVersionSchema,
  restoreEmployee,
  saveMonthlyEmployerCostDraft,
  updateEmployee,
  updateEmployeeSchema,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import {
  isRedirectError,
  mapWorkforceActionError,
} from '@/modules/workforce/application/map-workforce-action-error';

export interface WorkforceFormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

async function mapEmployeeActionError(error: unknown, fallback: string): Promise<WorkforceFormState> {
  if (isRedirectError(error)) throw error;
  return mapWorkforceActionError(error, fallback);
}

export async function createEmployeeAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const parsed = createEmployeeSchema.safeParse({
    name: formData.get('name'),
    rateUnit: formData.get('rateUnit') || 'monthly',
    baseRate: formData.get('baseRate'),
    currency: formData.get('currency') || undefined,
    burdenPercent: formData.get('burdenPercent') || null,
    hireDate: formData.get('hireDate') || null,
    endDate: formData.get('endDate') || null,
    validFrom: formData.get('validFrom') || undefined,
    jobTitle: formData.get('jobTitle') || null,
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    notes: formData.get('notes') || null,
    employeeNumber: formData.get('employeeNumber') || null,
    userId: formData.get('userId') || null,
    standardHoursPerDay: formData.get('standardHoursPerDay') || null,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const employee = await withOrgContext((context) => createEmployee(context, parsed.data));
    revalidatePath('/workforce', 'layout');
    redirect({ href: `/workforce/employees/${employee.id}`, locale });
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }

  return {};
}

function firstValidationMessage(
  source:
    | ValidationError
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      },
  fallback: string,
): string {
  if (source instanceof ValidationError) {
    return source.issues[0]?.message ?? source.message ?? fallback;
  }
  return source.error.issues[0]?.message ?? fallback;
}

function mapRateVersionValidationMessage(
  issue: { readonly path: readonly PropertyKey[]; readonly message: string },
  tWorkforce: (key: string) => string,
  fallback: string,
): string {
  const path = issue.path.map(String).join('.');
  if (path === 'validFrom' || issue.message === 'Invalid date') {
    return tWorkforce('employees.validation.invalidDate');
  }
  if (path === 'baseRate' || issue.message === 'Invalid amount') {
    return tWorkforce('employees.validation.invalidAmount');
  }
  if (path === 'burdenPercent' || issue.message === 'Invalid percent') {
    return tWorkforce('employees.validation.invalidPercent');
  }
  return issue.message || fallback;
}

export async function updateEmployeeAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const employeeId = String(formData.get('employeeId') ?? '');

  const parsed = updateEmployeeSchema.safeParse({
    name: formData.get('name') || undefined,
    status: formData.get('status') || undefined,
    jobTitle: formData.get('jobTitle') || null,
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    notes: formData.get('notes') || null,
    employeeNumber: formData.get('employeeNumber') || null,
    hireDate: formData.has('hireDate')
      ? formData.get('hireDate') || null
      : undefined,
    endDate: formData.has('endDate') ? formData.get('endDate') || null : undefined,
    standardHoursPerDay: formData.get('standardHoursPerDay') || null,
    userId: formData.has('userId') ? formData.get('userId') || null : undefined,
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed, tErrors('validationFailed')) };
  }

  try {
    await withOrgContext((context) => updateEmployee(context, employeeId, parsed.data));
    revalidatePath(`/workforce/employees/${employeeId}`);
    revalidatePath('/workforce/employees');
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export async function archiveEmployeeAction(employeeId: string): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => archiveEmployee(context, employeeId));
    revalidatePath(`/workforce/employees/${employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export async function restoreEmployeeAction(employeeId: string): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => restoreEmployee(context, employeeId));
    revalidatePath(`/workforce/employees/${employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export async function createRateVersionAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const tWorkforce = await getTranslations('workforce');

  const parsed = createRateVersionSchema.safeParse({
    employeeId: formData.get('employeeId'),
    validFrom: formData.get('validFrom'),
    baseRate: formData.get('baseRate'),
    rateUnit: formData.get('rateUnit'),
    currency: formData.get('currency') || undefined,
    burdenPercent: formData.get('burdenPercent') || null,
    notes: formData.get('notes') || null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue
        ? mapRateVersionValidationMessage(issue, tWorkforce, tErrors('validationFailed'))
        : tErrors('validationFailed'),
    };
  }

  try {
    await withOrgContext((context) => createRateVersion(context, parsed.data));
    revalidatePath(`/workforce/employees/${parsed.data.employeeId}`);
    revalidatePath('/workforce/employees');
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export async function saveOrgWorkFrameworkAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('workforce');

  const standardHoursPerDay = String(formData.get('standardHoursPerDay') ?? '').trim();
  const workingDaysPerMonth = String(formData.get('workingDaysPerMonth') ?? '').trim();
  const workWeekdaysRaw = formData
    .getAll('workWeekdays')
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => Number(value.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const workWeekdays =
    workWeekdaysRaw.length > 0 ? [...new Set(workWeekdaysRaw)].sort((a, b) => a - b) : null;

  if (!standardHoursPerDay) {
    return { error: t('workFramework.validationRequired') };
  }

  try {
    const { saveOrgWorkFrameworkHours } = await import('@/modules/tenancy');
    await withOrgContext((context) =>
      saveOrgWorkFrameworkHours(context, {
        standardHoursPerDay,
        workingDaysPerMonth: workingDaysPerMonth || null,
        workWeekdays,
      }),
    );
    revalidatePath('/workforce', 'layout');
    revalidatePath('/workforce/employees', 'layout');
    revalidatePath('/workforce/time', 'layout');
    revalidatePath('/projects', 'layout');
    revalidatePath('/', 'layout');
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

/**
 * Explicit Owner/admin bootstrap for EXISTING open-period workforce costing.
 * Not a GET. Not a fake salary edit. Idempotent. Skips closed months.
 */
export async function bootstrapWorkforceCostingAction(
  _prevState: WorkforceFormState,
  _formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('workforce');

  try {
    const { bootstrapOpenPeriodWorkforceCosting } = await import('@/modules/workforce');
    const result = await withOrgContext((context) =>
      bootstrapOpenPeriodWorkforceCosting(context),
    );
    revalidatePath('/workforce', 'layout');
    revalidatePath('/workforce/employees', 'layout');
    revalidatePath('/workforce/time', 'layout');
    revalidatePath('/projects', 'layout');
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: t('workFramework.bootstrapDone', {
        monthly: result.monthlyApplied,
        closed: result.monthlySkippedClosed,
        daily: result.dailyUpdated,
        snapshots: result.snapshotReconcile.updated,
      }),
    };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export interface MonthlyEmployerCostActionState {
  error?: string;
  ok?: boolean;
}

function parseAllocationLinesJson(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((line) => {
      const row = line as Record<string, unknown>;
      return {
        projectId: String(row.projectId ?? ''),
        hours: row.hours != null ? String(row.hours) : null,
        days: row.days != null ? String(row.days) : null,
        percent: row.percent != null ? String(row.percent) : null,
        amount: row.amount != null ? String(row.amount) : null,
        notes: row.notes != null ? String(row.notes) : null,
      };
    });
  } catch {
    return undefined;
  }
}

export async function saveMonthlyEmployerCostDraftAction(input: {
  employeeId: string;
  yearMonth: string;
  estimatedAmount?: string;
  actualAmount?: string;
  method?: string;
  allocationLinesJson?: string;
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      saveMonthlyEmployerCostDraft(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
        estimatedAmount: input.estimatedAmount ?? null,
        actualAmount: input.actualAmount ?? null,
        method: input.method as
          | 'hours'
          | 'days'
          | 'percent'
          | 'fixed_amount'
          | undefined,
        allocationLines: parseAllocationLinesJson(input.allocationLinesJson ?? null),
      }),
    );
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}

export async function applyMonthlyEmployerCostAllocationAction(input: {
  employeeId: string;
  yearMonth: string;
  runId?: string;
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      applyMonthlyEmployerCostAllocation(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
        runId: input.runId,
      }),
    );
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapEmployeeActionError(error, tErrors('unexpected'));
  }
}
