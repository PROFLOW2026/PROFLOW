'use server';

import {
  createBillingRecord,
  createBillingAdjustment,
  finalizeBillingRecord,
  allocateCustomerPayment,
  recordCustomerPayment,
  recordPayment,
  updateBillingRecord,
  voidBillingRecord,
  voidPayment,
} from '@/modules/billing';
import { releaseBillingRecordRetention } from '@/modules/retention';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, serializeError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import type { CreateBillingRecordInput, CreatePaymentInput } from '@/modules/billing';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';

export interface BillingFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function mapError(error: unknown, fallback: string): BillingFormState {
  if (error instanceof AppError) {
    const serialized = serializeError(error);
    return { error: serialized.messageKey };
  }
  return { error: fallback };
}

export async function createBillingRecordAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const changeOrderIds = formData.getAll('changeOrderIds').map(String).filter(Boolean);
  const input: CreateBillingRecordInput = {
    projectId: String(formData.get('projectId') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    currency: formData.get('currency') ? String(formData.get('currency')) : undefined,
    issueDate: String(formData.get('issueDate') ?? ''),
    dueDate: formData.get('dueDate') ? String(formData.get('dueDate')) : null,
    paymentTermId: formData.get('paymentTermId') ? String(formData.get('paymentTermId')) : null,
    reference: formData.get('reference') ? String(formData.get('reference')) : null,
    notes: formData.get('notes') ? String(formData.get('notes')) : null,
    retentionAmount: formData.get('retentionAmount')
      ? String(formData.get('retentionAmount'))
      : null,
    retentionPercent: formData.get('retentionPercent')
      ? String(formData.get('retentionPercent'))
      : null,
    changeOrderIds: changeOrderIds.length > 0 ? changeOrderIds : undefined,
    contractId: formData.get('contractId') ? String(formData.get('contractId')) : undefined,
    finalize: formData.get('finalize') === 'true',
  };

  try {
    const created = await withOrgContext((context) => createBillingRecord(context, input));
    revalidatePath('/billing');
    if (created.projectId) revalidatePath(`/projects/${created.projectId}`);
    redirect({ href: `/billing/${created.id}`, locale });
  } catch (error) {
    if (error instanceof AppError && error.messageKey === 'errors.notFound') {
      return mapError(error, tErrors('unexpected'));
    }
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }

  return {};
}

export async function updateBillingRecordAction(
  billingRecordId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    await withOrgContext((context) =>
      updateBillingRecord(context, {
        billingRecordId,
        projectId: formData.get('projectId') ? String(formData.get('projectId')) : undefined,
        amount: formData.get('amount') ? String(formData.get('amount')) : undefined,
        issueDate: formData.get('issueDate') ? String(formData.get('issueDate')) : undefined,
        dueDate: formData.get('dueDate') ? String(formData.get('dueDate')) : null,
        reference: formData.get('reference') ? String(formData.get('reference')) : null,
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
        retentionAmount: formData.get('retentionAmount')
          ? String(formData.get('retentionAmount'))
          : undefined,
        retentionPercent: formData.get('retentionPercent')
          ? String(formData.get('retentionPercent'))
          : undefined,
      }),
    );
    revalidatePath(`/billing/${billingRecordId}`);
    revalidatePath('/billing');
    redirect({ href: `/billing/${billingRecordId}`, locale });
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }

  return {};
}

export async function finalizeBillingRecordAction(billingRecordId: string): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => finalizeBillingRecord(context, billingRecordId));
    revalidatePath(`/billing/${billingRecordId}`);
    revalidatePath('/billing');
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('unexpected'));
    throw error;
  }

  return {};
}

export async function voidBillingRecordAction(billingRecordId: string): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => voidBillingRecord(context, billingRecordId));
    revalidatePath(`/billing/${billingRecordId}`);
    revalidatePath('/billing');
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('unexpected'));
    throw error;
  }

  return {};
}

export async function createPaymentAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const mode = String(formData.get('mode') ?? 'single');

  try {
    if (mode === 'unallocated') {
      const result = await withOrgContext((context) =>
        recordCustomerPayment(context, {
          clientId: String(formData.get('clientId') ?? ''),
          amount: String(formData.get('amount') ?? ''),
          currency: String(formData.get('currency') ?? ''),
          paymentDate: String(formData.get('paymentDate') ?? ''),
          method: formData.get('method') ? String(formData.get('method')) : null,
          reference: formData.get('reference') ? String(formData.get('reference')) : null,
          notes: formData.get('notes') ? String(formData.get('notes')) : null,
          applications: [],
        }),
      );
      revalidatePath('/billing');
      redirect({
        href: `/billing/payments/${result.paymentId}/allocate`,
        locale,
      });
    }

    if (mode === 'split') {
      const billingRecordIds = formData.getAll('applicationBillingRecordId').map(String);
      const amounts = formData.getAll('applicationAmount').map(String);
      const applications = billingRecordIds
        .map((billingRecordId, index) => ({
          billingRecordId,
          amount: amounts[index]?.trim() ?? '',
        }))
        .filter((app) => app.billingRecordId && app.amount);

      const result = await withOrgContext((context) =>
        recordCustomerPayment(context, {
          clientId: String(formData.get('clientId') ?? ''),
          amount: String(formData.get('amount') ?? ''),
          currency: String(formData.get('currency') ?? ''),
          paymentDate: String(formData.get('paymentDate') ?? ''),
          method: formData.get('method') ? String(formData.get('method')) : null,
          reference: formData.get('reference') ? String(formData.get('reference')) : null,
          notes: formData.get('notes') ? String(formData.get('notes')) : null,
          applications,
        }),
      );

      revalidatePath('/billing');
      for (const record of result.billingRecords) {
        revalidatePath(`/billing/${record.id}`);
        if (record.projectId) revalidatePath(`/projects/${record.projectId}`);
      }
      const redirectId = result.billingRecords[0]?.id;
      if (redirectId) {
        redirect({ href: `/billing/${redirectId}`, locale });
      }
      redirect({ href: '/billing', locale });
    }

    const input: CreatePaymentInput = {
      billingRecordId: String(formData.get('billingRecordId') ?? ''),
      amount: String(formData.get('amount') ?? ''),
      paymentDate: String(formData.get('paymentDate') ?? ''),
      method: formData.get('method') ? String(formData.get('method')) : null,
      reference: formData.get('reference') ? String(formData.get('reference')) : null,
      notes: formData.get('notes') ? String(formData.get('notes')) : null,
    };

    const result = await withOrgContext((context) => recordPayment(context, input));
    revalidatePath(`/billing/${result.billingRecord.id}`);
    revalidatePath('/billing');
    if (result.billingRecord.projectId) {
      revalidatePath(`/projects/${result.billingRecord.projectId}`);
    }
    redirect({ href: `/billing/${result.billingRecord.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }

  return {};
}

export async function allocatePaymentAction(
  paymentId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    const billingRecordIds = formData.getAll('applicationBillingRecordId').map(String);
    const amounts = formData.getAll('applicationAmount').map(String);
    const applications = billingRecordIds
      .map((billingRecordId, index) => ({
        billingRecordId,
        amount: amounts[index]?.trim() ?? '',
      }))
      .filter((app) => app.billingRecordId && app.amount);

    const result = await withOrgContext((context) =>
      allocateCustomerPayment(context, { paymentId, applications }),
    );

    revalidatePath('/billing');
    revalidatePath(`/billing/payments/${paymentId}/allocate`);
    for (const record of result.billingRecords) {
      revalidatePath(`/billing/${record.id}`);
      if (record.projectId) revalidatePath(`/projects/${record.projectId}`);
    }

    const redirectId = result.billingRecords[0]?.id;
    if (redirectId) {
      redirect({ href: `/billing/${redirectId}`, locale });
    }
    redirect({ href: '/billing', locale });
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }

  return {};
}

export async function voidPaymentAction(paymentId: string, billingRecordId: string): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');

  try {
    const result = await withOrgContext((context) => voidPayment(context, paymentId));
    revalidatePath('/billing');
    const ids = new Set<string>([
      billingRecordId,
      ...result.billingRecords.map((record) => record.id),
    ]);
    for (const id of ids) {
      revalidatePath(`/billing/${id}`);
    }
    for (const record of result.billingRecords) {
      if (record.projectId) revalidatePath(`/projects/${record.projectId}`);
    }
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('unexpected'));
    throw error;
  }

  return {};
}

export async function createAdjustmentAction(
  billingRecordId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    const created = await withOrgContext((context) =>
      createBillingAdjustment(context, {
        billingRecordId,
        amount: String(formData.get('amount') ?? ''),
        issueDate: String(formData.get('issueDate') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      }),
    );
    revalidatePath('/billing');
    redirect({ href: `/billing/${created.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }

  return {};
}

export async function updateBillingRetentionAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const billingRecordId = String(formData.get('sourceId') ?? '');

  try {
    await withOrgContext((context) =>
      updateBillingRecord(context, {
        billingRecordId,
        retentionAmount: formData.get('retentionAmount')
          ? String(formData.get('retentionAmount'))
          : null,
        retentionPercent: formData.get('retentionPercent')
          ? String(formData.get('retentionPercent'))
          : null,
      }),
    );
    revalidatePath(`/billing/${billingRecordId}`);
    revalidatePath('/billing');
    return {};
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }
}

export async function releaseBillingRetentionAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const tErrors = await getTranslations('errors');
  const billingRecordId = String(formData.get('sourceId') ?? '');

  try {
    await withOrgContext((context) =>
      releaseBillingRecordRetention(context, {
        sourceId: billingRecordId,
        amount: String(formData.get('amount') ?? ''),
        releasedOn: String(formData.get('releasedOn') ?? ''),
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      }),
    );
    revalidatePath(`/billing/${billingRecordId}`);
    revalidatePath('/billing');
    return {};
  } catch (error) {
    if (error instanceof AppError) return mapError(error, tErrors('validationFailed'));
    throw error;
  }
}
