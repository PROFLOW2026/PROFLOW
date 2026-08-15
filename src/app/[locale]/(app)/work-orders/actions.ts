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
  AppError,
  AuthorizationError,
  ConflictError,
  DomainRuleError,
  ValidationError,
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

async function mapValidationError(error: ValidationError): Promise<WorkOrderFormState> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (!issue.path) continue;
    fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapWorkOrderError(error: unknown): Promise<WorkOrderFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('service');
  if (error instanceof ValidationError) return await mapValidationError(error);
  if (error instanceof ConflictError) {
    if (error.messageKey.startsWith('scheduling.')) {
      const tScheduling = await getTranslations('scheduling');
      const key = error.messageKey.replace(/^scheduling\./, '');
      return {
        error: tScheduling(key as 'errors.bookingOverlap'),
        confirmRequired: Boolean(error.details?.confirmRequired),
      };
    }
    if (error.messageKey.startsWith('service.')) {
      const key = error.messageKey.replace(/^service\./, '');
      try {
        return { error: t(key as 'errors.checklistRequired') };
      } catch {
        return { error: error.message };
      }
    }
    return { error: error.message };
  }
  if (error instanceof DomainRuleError) {
    if (error.messageKey.startsWith('scheduling.')) {
      const tScheduling = await getTranslations('scheduling');
      const key = error.messageKey.replace(/^scheduling\./, '');
      try {
        return { error: tScheduling(key as 'errors.unavailableOverlap') };
      } catch {
        return { error: error.message };
      }
    }
    if (error.messageKey.startsWith('service.')) {
      const key = error.messageKey.replace(/^service\./, '');
      try {
        return { error: t(key as 'errors.checklistRequired') };
      } catch {
        return { error: error.message };
      }
    }
    return { error: error.message };
  }
  if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
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
