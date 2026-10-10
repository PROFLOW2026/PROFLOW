'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createOpportunity } from '@/modules/crm';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { DomainRuleError, mapServerActionError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CrmFormState } from '@/app/[locale]/(app)/crm/actions';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const s = String(value);
  return s === '' ? undefined : s;
}

export async function employeeCreateOpportunityAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const opportunity = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      if (!employeeHasPermission(context, PERMISSIONS.CRM_MANAGE)) {
        throw new DomainRuleError('No permission', 'employeeApp.errors.notAuthorized');
      }
      return createOpportunity(context, {
        name: formValue(formData, 'name') ?? '',
        prospectId: formValue(formData, 'prospectId'),
        leadId: formValue(formData, 'leadId'),
        expectedValueAmount: formValue(formData, 'expectedValueAmount'),
        currency: formValue(formData, 'currency'),
        expectedStartDate: formValue(formData, 'expectedStartDate'),
        referralSource: formValue(formData, 'referralSource'),
        notes: formValue(formData, 'notes'),
        nextActionAt: formValue(formData, 'nextActionAt'),
        nextActionText: formValue(formData, 'nextActionText'),
      });
    });
    revalidatePath('/employee/crm');
    revalidatePath('/crm');
    redirect({ href: `/employee/crm/opportunities/${opportunity.id}`, locale });
  } catch (error) {
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
    });
  }
}
