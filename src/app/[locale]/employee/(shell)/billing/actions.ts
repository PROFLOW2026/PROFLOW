'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { DomainRuleError } from '@/shared/errors';
import {
  createBillingRecord,
  listBillingRecords,
  recordCustomerPayment,
} from '@/modules/billing';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';

export async function employeeCreateBillingRecordAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const projectId = String(formData.get('projectId') ?? '').trim();
  const amount = String(formData.get('amount') ?? '').trim();
  const issueDate = String(formData.get('issueDate') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim() || null;
  const reference = String(formData.get('reference') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE)) {
      throw new DomainRuleError('No permission to create billing', 'employeeApp.errors.notAuthorized');
    }
    await createBillingRecord(context, {
      projectId,
      amount,
      issueDate: issueDate || todayInTimeZone(context.organization.timezone),
      dueDate,
      reference,
      notes,
      currency: context.organization.baseCurrency ?? 'ILS',
    });
  });

  revalidatePath('/employee/billing');
  redirect({ href: '/employee/billing', locale });
}

export async function employeeRecordPaymentAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const billingRecordId = String(formData.get('billingRecordId') ?? '').trim();
  const clientIdInput = String(formData.get('clientId') ?? '').trim();
  const amount = String(formData.get('amount') ?? '').trim();
  const paymentDate = String(formData.get('paymentDate') ?? '').trim();
  const method = String(formData.get('method') ?? '').trim() || null;
  const reference = String(formData.get('reference') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE)) {
      throw new DomainRuleError('No permission to record payments', 'employeeApp.errors.notAuthorized');
    }

    let clientId = clientIdInput;
    let applications: { billingRecordId: string; amount: string }[] = [];
    let currency = context.organization.baseCurrency ?? 'ILS';

    if (billingRecordId) {
      const records = await listBillingRecords(context, { filter: 'outstanding', limit: 200 });
      const selected = records.find((record) => record.id === billingRecordId);
      if (!selected?.clientId) {
        throw new DomainRuleError('Billing record requires a client', 'employeeApp.errors.notAuthorized');
      }
      clientId = selected.clientId;
      currency = selected.totalAmount.currency;
      applications = [{ billingRecordId, amount }];
    }

    if (!clientId) {
      throw new DomainRuleError('Client is required', 'employeeApp.errors.notAuthorized');
    }

    await recordCustomerPayment(context, {
      clientId,
      amount,
      currency,
      paymentDate: paymentDate || todayInTimeZone(context.organization.timezone),
      method,
      reference,
      notes,
      applications,
    });
  });

  revalidatePath('/employee/billing');
  redirect({ href: '/employee/billing', locale });
}
