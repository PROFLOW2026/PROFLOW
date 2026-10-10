'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import type { OrgContext } from '@/shared/auth/context';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import {
  createBillingAdjustment,
  createBillingRecord,
  finalizeBillingRecord,
  listBillingRecords,
  recordCustomerPayment,
  updateBillingRecord,
  voidBillingRecord,
  voidPayment,
} from '@/modules/billing';
import { releaseBillingRecordRetention } from '@/modules/retention';
import type { BillingFormState } from '@/modules/billing/ui/actions';
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

function revalidateEmployeeBillingRecord(billingRecordId: string) {
  revalidatePath(`/employee/billing/${billingRecordId}`);
  revalidatePath('/employee/billing');
}

async function assertEmployeeBillingManage(context: OrgContext): Promise<void> {
  await assertEmployeeAppContext(context);
  if (!employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE)) {
    throw new DomainRuleError('Not allowed', 'employeeApp.errors.notAuthorized');
  }
}

function mapBillingError(error: unknown, fallback: string): BillingFormState {
  if (error instanceof AppError) {
    return { error: error.messageKey };
  }
  return { error: fallback };
}

export async function employeeFinalizeBillingRecordAction(
  billingRecordId: string,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      await finalizeBillingRecord(context, billingRecordId);
    });
    revalidateEmployeeBillingRecord(billingRecordId);
  } catch (error) {
    return mapBillingError(error, tErrors('unexpected'));
  }
  return {};
}

export async function employeeVoidBillingRecordAction(
  billingRecordId: string,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      await voidBillingRecord(context, billingRecordId);
    });
    revalidateEmployeeBillingRecord(billingRecordId);
  } catch (error) {
    return mapBillingError(error, tErrors('unexpected'));
  }
  return {};
}

export async function employeeVoidPaymentAction(
  paymentId: string,
  billingRecordId: string,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      await voidPayment(context, paymentId);
    });
    revalidateEmployeeBillingRecord(billingRecordId);
  } catch (error) {
    return mapBillingError(error, tErrors('unexpected'));
  }
  return {};
}

export async function employeeCreateAdjustmentAction(
  billingRecordId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const created = await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      return createBillingAdjustment(context, {
        billingRecordId,
        amount: String(formData.get('amount') ?? ''),
        issueDate: String(formData.get('issueDate') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      });
    });
    revalidatePath('/employee/billing');
    redirect({ href: `/employee/billing/${created.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return mapBillingError(error, tErrors('validationFailed'));
    throw error;
  }
  return {};
}

export async function employeeUpdateBillingRetentionAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const billingRecordId = String(formData.get('sourceId') ?? '');
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      await updateBillingRecord(context, {
        billingRecordId,
        retentionAmount: formData.get('retentionAmount')
          ? String(formData.get('retentionAmount'))
          : null,
        retentionPercent: formData.get('retentionPercent')
          ? String(formData.get('retentionPercent'))
          : null,
      });
    });
    revalidateEmployeeBillingRecord(billingRecordId);
  } catch (error) {
    return mapBillingError(error, tErrors('validationFailed'));
  }
  return {};
}

export async function employeeReleaseBillingRetentionAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const billingRecordId = String(formData.get('sourceId') ?? '');
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeBillingManage(context);
      await releaseBillingRecordRetention(context, {
        sourceId: billingRecordId,
        amount: String(formData.get('amount') ?? ''),
        releasedOn: String(formData.get('releasedOn') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      });
    });
    revalidateEmployeeBillingRecord(billingRecordId);
  } catch (error) {
    return mapBillingError(error, tErrors('validationFailed'));
  }
  return {};
}
