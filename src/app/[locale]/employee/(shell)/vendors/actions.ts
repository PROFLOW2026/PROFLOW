'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { DomainRuleError } from '@/shared/errors';
import { createVendor } from '@/modules/vendors';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function employeeCreateVendorAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const email = String(formData.get('email') ?? '').trim() || null;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.VENDORS_MANAGE)) {
      throw new DomainRuleError('No permission to create vendors', 'employeeApp.errors.notAuthorized');
    }
    await createVendor(context, { name, phone, email });
  });

  revalidatePath('/employee/vendors');
  redirect({ href: '/employee/vendors', locale });
}
