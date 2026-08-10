/**
 * Typed offline draft payloads for product sync (Wave 4).
 * Drafts are candidates only — never authoritative financial truth.
 */

import { parseAllocationsFromForm } from '@/modules/expenses/validation/schemas';
import type { CaptureDraftPayload } from './capture';
import type { DraftKind } from './types';

function formText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function formTextRequired(formData: FormData, key: string): string {
  return formText(formData, key) ?? '';
}

export interface ExpenseDraftPayload extends Record<string, unknown> {
  readonly amount: string;
  readonly currency: string;
  readonly description: string | null;
  readonly expenseDate: string | null;
  readonly supplierName: string | null;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly costFamily: string | null;
  readonly costCategoryId: string | null;
  readonly amountIncludesTax: string | boolean | null;
  readonly netAmount: string | null;
  readonly taxAmount: string | null;
  readonly paymentMethod: string | null;
  readonly notes: string | null;
  readonly recurrenceCadence: string | null;
  readonly recurrenceCustomLabel: string | null;
  readonly allocations: unknown;
  /** Present for edit drafts. */
  readonly expenseId?: string | null;
}

export interface TimeEntryDraftPayload extends Record<string, unknown> {
  readonly employeeId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly kind: string;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly phaseId: string | null;
  readonly timeCodeId: string | null;
  readonly description: string | null;
}

export interface ChangeRequestDraftPayload extends Record<string, unknown> {
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly direction: 'addition' | 'reduction';
  readonly requestedAmount: string | null;
  readonly changeRequestId?: string | null;
}

export interface DailyLogDraftPayload extends Record<string, unknown> {
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly logDate: string;
  readonly weather: string | null;
  readonly summary: string;
  readonly workforceNotes: string | null;
  readonly blockers: string | null;
  readonly dailyLogId?: string | null;
}

export interface PunchDraftPayload extends Record<string, unknown> {
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: string | null;
  readonly location: string | null;
  readonly dueDate: string | null;
  readonly punchListItemId?: string | null;
}

export interface InspectionDraftPayload extends Record<string, unknown> {
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly title: string;
  readonly kind: string | null;
  readonly scheduledOn: string | null;
  readonly notes: string | null;
  readonly inspectionId?: string | null;
}

export type ProductDraftPayload =
  | ExpenseDraftPayload
  | TimeEntryDraftPayload
  | ChangeRequestDraftPayload
  | DailyLogDraftPayload
  | PunchDraftPayload
  | InspectionDraftPayload
  | CaptureDraftPayload;

export function expensePayloadFromFormData(formData: FormData): ExpenseDraftPayload {
  return {
    amount: formTextRequired(formData, 'amount'),
    currency: formTextRequired(formData, 'currency'),
    description: formText(formData, 'description'),
    expenseDate: formText(formData, 'expenseDate'),
    supplierName: formText(formData, 'supplierName'),
    vendorId: formText(formData, 'vendorId'),
    projectId: formText(formData, 'projectId'),
    workPackageId: formText(formData, 'workPackageId'),
    costFamily: formText(formData, 'costFamily'),
    costCategoryId: formText(formData, 'costCategoryId'),
    amountIncludesTax: formText(formData, 'amountIncludesTax'),
    netAmount: formText(formData, 'netAmount'),
    taxAmount: formText(formData, 'taxAmount'),
    paymentMethod: formText(formData, 'paymentMethod'),
    notes: formText(formData, 'notes'),
    recurrenceCadence: formText(formData, 'recurrenceCadence'),
    recurrenceCustomLabel: formText(formData, 'recurrenceCustomLabel'),
    allocations: parseAllocationsFromForm(formData),
    expenseId: formText(formData, 'expenseId'),
  };
}

export function timeEntryPayloadFromFormData(formData: FormData): TimeEntryDraftPayload {
  return {
    employeeId: formTextRequired(formData, 'employeeId'),
    workDate: formTextRequired(formData, 'workDate'),
    hours: formTextRequired(formData, 'hours'),
    kind: formText(formData, 'kind') ?? 'project',
    projectId: formText(formData, 'projectId'),
    workPackageId: formText(formData, 'workPackageId'),
    phaseId: formText(formData, 'phaseId'),
    timeCodeId: formText(formData, 'timeCodeId'),
    description: formText(formData, 'description'),
  };
}

export function changeRequestPayloadFromFormData(formData: FormData): ChangeRequestDraftPayload {
  const directionRaw = formText(formData, 'direction');
  const direction = directionRaw === 'reduction' ? 'reduction' : 'addition';
  return {
    projectId: formTextRequired(formData, 'projectId'),
    title: formTextRequired(formData, 'title'),
    description: formText(formData, 'description'),
    direction,
    requestedAmount: formText(formData, 'requestedAmount'),
    changeRequestId: formText(formData, 'changeRequestId'),
  };
}

export function dailyLogPayloadFromFormData(formData: FormData): DailyLogDraftPayload {
  return {
    projectId: formText(formData, 'projectId'),
    workPackageId: formText(formData, 'workPackageId'),
    logDate: formTextRequired(formData, 'logDate'),
    weather: formText(formData, 'weather'),
    summary: formTextRequired(formData, 'summary'),
    workforceNotes: formText(formData, 'workforceNotes'),
    blockers: formText(formData, 'blockers'),
    dailyLogId: formText(formData, 'dailyLogId'),
  };
}

export function punchPayloadFromFormData(formData: FormData): PunchDraftPayload {
  return {
    projectId: formTextRequired(formData, 'projectId'),
    workPackageId: formText(formData, 'workPackageId'),
    title: formTextRequired(formData, 'title'),
    description: formText(formData, 'description'),
    priority: formText(formData, 'priority'),
    location: formText(formData, 'location'),
    dueDate: formText(formData, 'dueDate'),
    punchListItemId: formText(formData, 'punchListItemId'),
  };
}

export function inspectionPayloadFromFormData(formData: FormData): InspectionDraftPayload {
  return {
    projectId: formTextRequired(formData, 'projectId'),
    workPackageId: formText(formData, 'workPackageId'),
    title: formTextRequired(formData, 'title'),
    kind: formText(formData, 'kind'),
    scheduledOn: formText(formData, 'scheduledOn'),
    notes: formText(formData, 'notes'),
    inspectionId: formText(formData, 'inspectionId'),
  };
}

export function payloadBuilderForKind(
  kind: Exclude<DraftKind, 'capture'>,
): (formData: FormData) => Record<string, unknown> {
  switch (kind) {
    case 'expense':
      return expensePayloadFromFormData;
    case 'time_entry':
      return timeEntryPayloadFromFormData;
    case 'change_request':
      return changeRequestPayloadFromFormData;
    case 'daily_log':
      return dailyLogPayloadFromFormData;
    case 'punch':
      return punchPayloadFromFormData;
    case 'inspection':
      return inspectionPayloadFromFormData;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function serverMetaFromExpensePayload(payload: ExpenseDraftPayload): {
  serverId: string | null;
} {
  return { serverId: payload.expenseId ?? null };
}

export function serverMetaFromChangeRequestPayload(payload: ChangeRequestDraftPayload): {
  serverId: string | null;
} {
  return { serverId: payload.changeRequestId ?? null };
}

export function serverMetaFromDailyLogPayload(payload: DailyLogDraftPayload): {
  serverId: string | null;
} {
  return { serverId: payload.dailyLogId ?? null };
}

export function serverMetaFromPunchPayload(payload: PunchDraftPayload): {
  serverId: string | null;
} {
  return { serverId: payload.punchListItemId ?? null };
}

export function serverMetaFromInspectionPayload(payload: InspectionDraftPayload): {
  serverId: string | null;
} {
  return { serverId: payload.inspectionId ?? null };
}
