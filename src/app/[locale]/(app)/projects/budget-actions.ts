'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createProjectBudget, reviseProjectBudget } from '@/modules/budgets';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface BudgetActionState {
  error?: string;
  ok?: boolean;
}

async function mapError(error: unknown): Promise<BudgetActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('budgets');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      budgets: (key) => {
        // messageKeys are budgets.activeExists / budgets.notActive (not budgets.errors.*)
        if (key === 'activeExists') return t('errors.activeExists');
        if (key === 'notActive') return t('errors.notActive');
        return t(`errors.${key}` as 'errors.activeExists');
      },
    },
  });
}

function revalidateBudgetSurfaces(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/jobs/${projectId}`);
}

export async function createProjectBudgetAction(input: {
  projectId: string;
  totalBudgetAmount?: string | null;
  currency?: string;
  name?: string;
  lines?: Array<{
    lineType: 'total' | 'category' | 'work_package' | 'discipline' | 'cost_code';
    label: string;
    budgetAmount: string;
    categoryKey?: string | null;
    workPackageId?: string | null;
    etcAmount?: string | null;
    sortOrder?: number;
  }>;
}): Promise<BudgetActionState> {
  try {
    await withOrgContext(async (context) => {
      await createProjectBudget(context, {
        projectId: input.projectId,
        totalBudgetAmount: input.totalBudgetAmount,
        currency: input.currency,
        name: input.name,
        lines: input.lines,
      });
    });
    revalidateBudgetSurfaces(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function reviseProjectBudgetAction(input: {
  budgetId: string;
  reason: string;
  totalBudgetAmount?: string | null;
  projectId?: string;
  lines?: Array<{
    lineType: 'total' | 'category' | 'work_package' | 'discipline' | 'cost_code';
    label: string;
    budgetAmount: string;
    categoryKey?: string | null;
    workPackageId?: string | null;
    etcAmount?: string | null;
    sortOrder?: number;
  }>;
}): Promise<BudgetActionState> {
  try {
    const result = await withOrgContext(async (context) =>
      reviseProjectBudget(context, {
        budgetId: input.budgetId,
        reason: input.reason,
        totalBudgetAmount: input.totalBudgetAmount,
        lines: input.lines,
      }),
    );
    if (input.projectId) {
      revalidateBudgetSurfaces(input.projectId);
    } else {
      // Soft revalidate common shells when project id not passed from client.
      revalidatePath('/projects');
      revalidatePath('/jobs');
    }
    void result;
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
