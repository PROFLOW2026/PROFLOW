'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  applyMonthlyEmployerCostAllocation,
  correctMonthlyEmployerCostActual,
  loadMonthlyEmployerCostReview,
  returnMonthlyEmployerCostToEstimate,
  saveMonthlyEmployerCostDraft,
  type MonthlyEmployerCostReview,
} from '@/modules/workforce';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import {
  assertCanManageWorkforceCost,
  assertCanReadWorkforceCost,
} from '@/modules/workforce/application/workforce-cost-authz';
import {
  isRedirectError,
  mapWorkforceActionError,
} from '@/modules/workforce/application/map-workforce-action-error';
import { withOrgContext } from '@/shared/auth/session';

export interface MonthlyEmployerCostActionState {
  error?: string;
  ok?: boolean;
}

async function mapEmployeeWorkforceCostError(
  error: unknown,
  fallback: string,
): Promise<MonthlyEmployerCostActionState> {
  if (isRedirectError(error)) throw error;
  return mapWorkforceActionError(error, fallback);
}

function revalidateEmployeeWorkforceEmployee(employeeId: string) {
  revalidatePath(`/employee/workforce/employees/${employeeId}`);
  revalidatePath('/employee/workforce');
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

export async function employeeLoadMonthlyEmployerCostReviewAction(input: {
  employeeId: string;
  yearMonth: string;
}): Promise<{ error?: string; review?: MonthlyEmployerCostReview }> {
  const tErrors = await getTranslations('errors');

  try {
    const review = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      assertCanReadWorkforceCost(context);
      return loadMonthlyEmployerCostReview(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
      });
    });
    return { review };
  } catch (error) {
    return mapEmployeeWorkforceCostError(error, tErrors('unexpected'));
  }
}

export async function employeeSaveMonthlyEmployerCostDraftAction(input: {
  employeeId: string;
  yearMonth: string;
  estimatedAmount?: string;
  actualAmount?: string;
  method?: string;
  allocationLinesJson?: string;
  companyOnlyAmount?: string;
  remainderAllocationIntent?: 'auto_pool' | 'company_only';
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      assertCanManageWorkforceCost(context);
      await saveMonthlyEmployerCostDraft(context, {
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
        companyOnlyAmount: input.companyOnlyAmount ?? null,
        remainderAllocationIntent: input.remainderAllocationIntent,
      });
    });
    revalidateEmployeeWorkforceEmployee(input.employeeId);
    return { ok: true };
  } catch (error) {
    return mapEmployeeWorkforceCostError(error, tErrors('unexpected'));
  }
}

export async function employeeApplyMonthlyEmployerCostAllocationAction(input: {
  employeeId: string;
  yearMonth: string;
  runId?: string;
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      assertCanManageWorkforceCost(context);
      await applyMonthlyEmployerCostAllocation(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
        runId: input.runId,
      });
    });
    revalidateEmployeeWorkforceEmployee(input.employeeId);
    return { ok: true };
  } catch (error) {
    return mapEmployeeWorkforceCostError(error, tErrors('unexpected'));
  }
}

export async function employeeCorrectMonthlyEmployerCostActualAction(input: {
  employeeId: string;
  yearMonth: string;
  estimatedAmount?: string;
  actualAmount?: string | null;
  correctionNote?: string | null;
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      assertCanManageWorkforceCost(context);
      await correctMonthlyEmployerCostActual(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
        estimatedAmount: input.estimatedAmount ?? null,
        actualAmount: input.actualAmount ?? null,
        correctionNote: input.correctionNote ?? null,
      });
    });
    revalidateEmployeeWorkforceEmployee(input.employeeId);
    return { ok: true };
  } catch (error) {
    return mapEmployeeWorkforceCostError(error, tErrors('unexpected'));
  }
}

export async function employeeReturnMonthlyEmployerCostToEstimateAction(input: {
  employeeId: string;
  yearMonth: string;
  note?: string | null;
}): Promise<MonthlyEmployerCostActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      assertCanManageWorkforceCost(context);
      await returnMonthlyEmployerCostToEstimate(context, {
        employeeId: input.employeeId,
        yearMonth: input.yearMonth,
        note: input.note ?? null,
      });
    });
    revalidateEmployeeWorkforceEmployee(input.employeeId);
    return { ok: true };
  } catch (error) {
    return mapEmployeeWorkforceCostError(error, tErrors('unexpected'));
  }
}
