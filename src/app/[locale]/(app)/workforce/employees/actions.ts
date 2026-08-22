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
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface WorkforceFormState {
  error?: string;
  ok?: boolean;
}

export async function createEmployeeAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const parsed = createEmployeeSchema.safeParse({
    name: formData.get('name'),
    rateUnit: formData.get('rateUnit'),
    baseRate: formData.get('baseRate'),
    currency: formData.get('currency') || undefined,
    burdenPercent: formData.get('burdenPercent') || null,
    validFrom: formData.get('validFrom') || undefined,
    jobTitle: formData.get('jobTitle') || null,
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    notes: formData.get('notes') || null,
    employeeNumber: formData.get('employeeNumber') || null,
    userId: formData.get('userId') || null,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const employee = await withOrgContext((context) => createEmployee(context, parsed.data));
    revalidatePath('/workforce', 'layout');
    redirect({ href: `/workforce/employees/${employee.id}`, locale });
  } catch (error) {
    if (error instanceof DomainRuleError || error instanceof ValidationError) {
      return { error: error.message };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
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
    standardHoursPerDay: formData.get('standardHoursPerDay') || null,
    userId: formData.has('userId') ? formData.get('userId') || null : undefined,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => updateEmployee(context, employeeId, parsed.data));
    revalidatePath(`/workforce/employees/${employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainRuleError || error instanceof ValidationError) {
      return { error: error.message };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
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
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
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
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function createRateVersionAction(
  _prevState: WorkforceFormState,
  formData: FormData,
): Promise<WorkforceFormState> {
  const tErrors = await getTranslations('errors');

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
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => createRateVersion(context, parsed.data));
    revalidatePath(`/workforce/employees/${parsed.data.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DomainRuleError) {
      return { error: error.message };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
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
    if (error instanceof ValidationError || error instanceof DomainRuleError) {
      return { error: error.message };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
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
    if (error instanceof ValidationError || error instanceof DomainRuleError) {
      return { error: error.message };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
