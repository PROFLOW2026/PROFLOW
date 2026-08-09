'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createEmployee, createEmployeeSchema } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface WorkforceFormState {
  error?: string;
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
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const employee = await withOrgContext((context) => createEmployee(context, parsed.data));
    revalidatePath('/workforce', 'layout');
    redirect({ href: `/workforce/employees/${employee.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}
