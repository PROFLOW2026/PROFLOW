'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createApBill, findApBillById } from '@/modules/ap';
import { acceptApAmountInput } from '@/modules/ap/domain/accept-amount-input';
import { holdApBillDuplicateWarnings } from '@/modules/duplicate-warnings';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function employeeCreateApBillDraftAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const vendorId = String(formData.get('vendorId') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const amount = String(formData.get('amount') ?? '').trim();
  const billDate = String(formData.get('billDate') ?? '').trim();
  const reference = String(formData.get('reference') ?? '').trim();

  if (!vendorId || !description || !/^\d+(\.\d{1,6})?$/.test(amount)) {
    redirect({ href: '/employee/ap/new?error=1', locale });
  }

  let billId = '';
  try {
    const bill = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      if (!employeeHasPermission(context, PERMISSIONS.AP_MANAGE)) {
        throw new DomainRuleError('Not allowed to create vendor bills', 'errors.validationFailed');
      }
      if (!employeeHasPermission(context, PERMISSIONS.VENDORS_READ)) {
        throw new DomainRuleError('Vendor read is required', 'errors.validationFailed');
      }
      const currency = context.organization.baseCurrency ?? 'ILS';
      const storedAmount = acceptApAmountInput(amount, currency);
      return createApBill(context, {
        vendorId,
        reference: reference || null,
        billDate: billDate || null,
        currency,
        totalAmount: storedAmount,
        amountIncludesTax: false,
        asDraft: true,
        lines: [
          {
            description,
            quantity: '1',
            unitAmount: storedAmount,
            lineTotal: storedAmount,
            currency,
          },
        ],
      });
    });
    billId = bill.id;
  } catch (error) {
    if (error instanceof AppError) {
      redirect({ href: '/employee/ap/new?error=1', locale });
    }
    throw error;
  }

  revalidatePath('/employee/ap');
  redirect({ href: `/employee/ap/${billId}`, locale });
}

export async function employeeAcknowledgeApDuplicateWarningsAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const billId = String(formData.get('billId') ?? '').trim();
  if (!billId) redirect({ href: '/employee/ap', locale });

  await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_MANAGE)) {
      throw new DomainRuleError('Not allowed to confirm vendor bill warnings', 'errors.validationFailed');
    }
    const bill = await findApBillById(context.db, context.organizationId, billId);
    if (!bill) throw new DomainRuleError('Vendor bill was not found', 'errors.notFound');
    await holdApBillDuplicateWarnings(
      context,
      {
        id: bill.id,
        vendorId: bill.vendorId,
        projectId: bill.projectId,
        netAmount: bill.netAmount,
        totalAmount: bill.totalAmount,
        currency: bill.currency,
        reference: bill.reference,
        billDate: bill.billDate,
      },
      {
        confirmDistinctCosts: formData.get('confirmDistinctCosts') === 'true',
        acknowledgeDuplicateVendorReference: formData.get('acknowledgeDuplicateVendorReference') === 'true',
      },
    );
  });

  revalidatePath(`/employee/ap/${billId}`);
  redirect({ href: `/employee/ap/${billId}`, locale });
}
