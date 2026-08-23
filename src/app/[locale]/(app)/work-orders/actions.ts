'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createWorkOrder,
  rescheduleWorkOrder,
  updateServiceStatus,
  updateWorkOrder,
  createWorkOrderBilling,
} from '@/modules/service';
import { withOrgContext } from '@/shared/auth/session';
import {
  ConflictError,
  mapServerActionError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface WorkOrderFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  confirmRequired?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

async function mapWorkOrderError(error: unknown): Promise<WorkOrderFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('service');
  const tScheduling = await getTranslations('scheduling');

  if (error instanceof ConflictError) {
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        scheduling: (key) => tScheduling(key as 'errors.bookingOverlap'),
        service: (key) => t(key as 'errors.checklistRequired'),
      },
    });
    return {
      error: mapped.error,
      confirmRequired: Boolean(error.details?.confirmRequired),
    };
  }

  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      scheduling: (key) => tScheduling(key as 'errors.unavailableOverlap'),
      service: (key) => t(key as 'errors.checklistRequired'),
    },
  });
}

export async function createWorkOrderAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const locale = await getLocale();

  const clientMode = String(formData.get('clientMode') ?? 'new');
  let clientId: string | null = null;
  let clientName: string | null = null;

  if (clientMode === 'existing') {
    const raw = formData.get('clientId');
    clientId = raw ? String(raw) : null;
  } else {
    clientName = String(formData.get('clientName') ?? '').trim() || null;
  }

  try {
    const result = await withOrgContext((context) =>
      createWorkOrder(context, {
        name: requiredFormValue(formData, 'name'),
        description: formValue(formData, 'description'),
        clientId,
        clientName,
        siteAddress: formValue(formData, 'siteAddress'),
        contactName: formValue(formData, 'contactName'),
        contactPhone: formValue(formData, 'contactPhone'),
        category: formValue(formData, 'category'),
        priority: (formValue(formData, 'priority') as
          | 'low'
          | 'normal'
          | 'high'
          | 'urgent'
          | undefined) ?? 'normal',
        requestedDate: formValue(formData, 'requestedDate'),
        scheduledStartAt: formValue(formData, 'scheduledStartAt'),
        scheduledEndAt: formValue(formData, 'scheduledEndAt'),
        assigneeEmployeeId: formValue(formData, 'assigneeEmployeeId'),
        checklistTemplateId: formValue(formData, 'checklistTemplateId'),
        notes: formValue(formData, 'notes'),
        serviceNotes: formValue(formData, 'serviceNotes'),
        pricingMode: requiredFormValue(formData, 'pricingMode') as 'fixed' | 'open',
        priceAmount: formValue(formData, 'contractValueAmount') ?? formValue(formData, 'priceAmount'),
        priceCurrency:
          formValue(formData, 'contractValueCurrency') ?? formValue(formData, 'priceCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
      }),
    );

    revalidatePath('/work-orders');
    revalidatePath('/dispatch');
    revalidatePath('/projects');
    redirect({ href: `/work-orders/${result.projectId}`, locale });
  } catch (error) {
    return await mapWorkOrderError(error);
  }

  return {};
}

export async function updateWorkOrderAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const workOrderId = requiredFormValue(formData, 'workOrderId');

  try {
    await withOrgContext((context) =>
      updateWorkOrder(context, {
        workOrderId,
        name: formValue(formData, 'name'),
        description: formValue(formData, 'description'),
        siteAddress: formValue(formData, 'siteAddress'),
        contactName: formValue(formData, 'contactName'),
        contactPhone: formValue(formData, 'contactPhone'),
        category: formValue(formData, 'category'),
        priority: formValue(formData, 'priority') as
          | 'low'
          | 'normal'
          | 'high'
          | 'urgent'
          | undefined,
        requestedDate: formValue(formData, 'requestedDate'),
        scheduledStartAt: formValue(formData, 'scheduledStartAt'),
        scheduledEndAt: formValue(formData, 'scheduledEndAt'),
        assigneeEmployeeId: formValue(formData, 'assigneeEmployeeId'),
        checklistTemplateId: formValue(formData, 'checklistTemplateId'),
        notes: formValue(formData, 'notes'),
        serviceNotes: formValue(formData, 'serviceNotes'),
        serviceStatus: formValue(formData, 'serviceStatus') as
          | 'new'
          | 'scheduled'
          | 'in_progress'
          | 'waiting'
          | 'completed'
          | 'cancelled'
          | undefined,
      }),
    );

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath('/work-orders');
    revalidatePath('/dispatch');
    return { success: true };
  } catch (error) {
    return await mapWorkOrderError(error);
  }
}

export async function updateServiceStatusAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const workOrderId = requiredFormValue(formData, 'workOrderId');

  try {
    await withOrgContext((context) =>
      updateServiceStatus(context, {
        workOrderId,
        serviceStatus: requiredFormValue(formData, 'serviceStatus') as
          | 'new'
          | 'scheduled'
          | 'in_progress'
          | 'waiting'
          | 'completed'
          | 'cancelled',
      }),
    );

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath('/work-orders');
    revalidatePath('/dispatch');
    return { success: true };
  } catch (error) {
    return await mapWorkOrderError(error);
  }
}

export async function rescheduleWorkOrderAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const workOrderId = requiredFormValue(formData, 'workOrderId');

  try {
    await withOrgContext((context) =>
      rescheduleWorkOrder(context, {
        workOrderId,
        scheduledStartAt: formValue(formData, 'scheduledStartAt'),
        scheduledEndAt: formValue(formData, 'scheduledEndAt'),
        assigneeEmployeeId: formValue(formData, 'assigneeEmployeeId'),
        serviceStatus: formValue(formData, 'serviceStatus') as
          | 'new'
          | 'scheduled'
          | 'in_progress'
          | 'waiting'
          | 'completed'
          | 'cancelled'
          | undefined,
        confirmConflict: formValue(formData, 'confirmConflict') === 'on',
      }),
    );

    revalidatePath('/dispatch');
    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath('/work-orders');
    revalidatePath('/scheduling');
    return { success: true };
  } catch (error) {
    return await mapWorkOrderError(error);
  }
}

export async function createWorkOrderBillingAction(
  _prev: WorkOrderFormState,
  formData: FormData,
): Promise<WorkOrderFormState> {
  const workOrderId = requiredFormValue(formData, 'workOrderId');

  try {
    await withOrgContext((context) =>
      createWorkOrderBilling(context, {
        workOrderId,
        laborHours: formValue(formData, 'laborHours'),
        laborRate: formValue(formData, 'laborRate'),
        materialsAmount: formValue(formData, 'materialsAmount'),
        callOutFee: formValue(formData, 'callOutFee'),
        additionalCharges: formValue(formData, 'additionalCharges'),
        discountAmount: formValue(formData, 'discountAmount'),
        notes: formValue(formData, 'notes'),
      }),
    );

    revalidatePath(`/work-orders/${workOrderId}`);
    revalidatePath('/billing');
    return { success: true };
  } catch (error) {
    return await mapWorkOrderError(error);
  }
}
