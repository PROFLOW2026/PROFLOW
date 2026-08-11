'use server';

import 'server-only';

import {
  createChangeRequest,
  getChangeRequestDetail,
  updateChangeRequest,
} from '@/modules/commercial';
import { getDocumentById } from '@/modules/documents';
import {
  createExpense,
  createExpenseSchema,
  getExpense,
  updateExpense,
  updateExpenseSchema,
} from '@/modules/expenses';
import {
  createDailyLog,
  createInspection,
  createPunchListItem,
  getDailyLogForOrg,
  getInspectionForOrg,
  getPunchListItemForOrg,
  updateDailyLog,
  updateInspection,
  updatePunchListItem,
} from '@/modules/field-ops';
import {
  createInspectionSchema,
  createPunchListItemSchema,
} from '@/modules/field-ops/validation/schemas';
import {
  createFormSubmission,
  FORM_OWNER_TYPES,
  getFormSubmissionForOrg,
  getFormTemplateForOrg,
  updateFormSubmissionDraft,
} from '@/modules/forms';
import { createTimeEntry, createTimeEntrySchema } from '@/modules/workforce';
import { findTimeEntryById } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, isAppError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type {
  ChangeRequestDraftPayload,
  DailyLogDraftPayload,
  ExpenseDraftPayload,
  InspectionDraftPayload,
  PunchDraftPayload,
  TimeEntryDraftPayload,
} from '../domain/payloads';
import type { DraftKind, QueuedAction, ServerTruthHint } from '../domain/types';
import { DRAFT_KINDS } from '../domain/types';
import { appendOfflineMarker, likePatternForOfflineMarker } from '../domain/offline-marker';
import { and, eq, isNull, like } from 'drizzle-orm';
import {
  changeRequests,
  dailyLogs,
  expenses,
  inspections,
  punchListItems,
  timeEntries,
} from '@drizzle/schema';
import { OfflineSyncSubmitError } from '../domain/sync-submit-error';

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new OfflineSyncSubmitError('Invalid server updatedAt.');
  }
  return parsed.toISOString();
}

function asRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return payload;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OfflineSyncSubmitError(`Draft payload missing ${key}.`);
  }
  return value.trim();
}

function optionalString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

function mapSubmitError(error: unknown): never {
  if (error instanceof OfflineSyncSubmitError) throw error;
  if (isAppError(error) || error instanceof AppError) {
    throw new OfflineSyncSubmitError(error.message || 'Server rejected the offline draft.');
  }
  if (error instanceof Error) throw new OfflineSyncSubmitError(error.message);
  throw new OfflineSyncSubmitError('Server rejected the offline draft.');
}

export async function fetchOfflineServerTruthAction(input: {
  readonly kind: DraftKind;
  readonly serverId: string | null;
}): Promise<ServerTruthHint | null> {
  if (!input.serverId) return null;
  if (!(DRAFT_KINDS as readonly string[]).includes(input.kind)) return null;

  try {
    return await withOrgContext(async (context) => {
      switch (input.kind) {
        case 'expense': {
          const expense = await getExpense(context, input.serverId!);
          return {
            serverId: expense.id,
            serverUpdatedAt: toIso(expense.updatedAt),
            snapshot: {
              status: expense.status,
              amount: expense.grossAmount.amount,
              currency: expense.grossAmount.currency,
            },
          };
        }
        case 'change_request': {
          const detail = await getChangeRequestDetail(context, input.serverId!);
          return {
            serverId: detail.id,
            serverUpdatedAt: toIso(detail.updatedAt),
            snapshot: {
              status: detail.status,
              title: detail.title,
            },
          };
        }
        case 'daily_log': {
          const log = await getDailyLogForOrg(context, input.serverId!);
          return {
            serverId: log.id,
            serverUpdatedAt: toIso(log.updatedAt),
            snapshot: {
              logDate: log.logDate,
              summary: log.summary,
            },
          };
        }
        case 'time_entry': {
          assertPermission(context, PERMISSIONS.TIME_MANAGE);
          const entry = await findTimeEntryById(
            context.db,
            context.organizationId,
            input.serverId!,
          );
          if (!entry) return null;
          return {
            serverId: entry.id,
            serverUpdatedAt: toIso(entry.updatedAt),
            snapshot: {
              hours: entry.hours,
              workDate: entry.workDate,
            },
          };
        }
        case 'capture': {
          const doc = await getDocumentById(context, input.serverId!);
          if (!doc) return null;
          return {
            serverId: doc.id,
            serverUpdatedAt: toIso(doc.updatedAt),
            snapshot: {
              status: doc.status,
              fileName: doc.originalFilename,
            },
          };
        }
        case 'punch': {
          const item = await getPunchListItemForOrg(context, input.serverId!);
          return {
            serverId: item.id,
            serverUpdatedAt: toIso(item.updatedAt),
            snapshot: {
              status: item.status,
              title: item.title,
            },
          };
        }
        case 'inspection': {
          const item = await getInspectionForOrg(context, input.serverId!);
          return {
            serverId: item.id,
            serverUpdatedAt: toIso(item.updatedAt),
            snapshot: {
              status: item.status,
              title: item.title,
            },
          };
        }
        case 'form_submission': {
          const submission = await getFormSubmissionForOrg(context, input.serverId!);
          return {
            serverId: submission.id,
            serverUpdatedAt: toIso(submission.updatedAt),
            snapshot: {
              status: submission.status,
              templateId: submission.templateId,
            },
          };
        }
        default:
          return null;
      }
    });
  } catch (error) {
    if (isAppError(error) && error.messageKey === 'errors.notFound') return null;
    throw error;
  }
}

async function submitExpense(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload) as ExpenseDraftPayload;
  const expenseId = action.serverId ?? optionalString(payload, 'expenseId');

  if (expenseId) {
    const parsed = updateExpenseSchema.safeParse({
      ...payload,
      expenseId,
      expenseDate: optionalString(payload, 'expenseDate') ?? undefined,
      recurrenceCadence: optionalString(payload, 'recurrenceCadence') ?? undefined,
      allocations: Array.isArray(payload.allocations) ? payload.allocations : [],
    });
    if (!parsed.success) {
      throw new OfflineSyncSubmitError('Expense draft failed validation.');
    }
    const updated = await withOrgContext((context) => updateExpense(context, parsed.data));
    return { serverId: updated.id, serverUpdatedAt: toIso(updated.updatedAt) };
  }

  const parsed = createExpenseSchema.safeParse({
    ...payload,
    expenseDate: optionalString(payload, 'expenseDate') ?? undefined,
    recurrenceCadence: optionalString(payload, 'recurrenceCadence') ?? undefined,
    allocations: Array.isArray(payload.allocations) ? payload.allocations : [],
    notes: appendOfflineMarker(optionalString(payload, 'notes'), action.localId),
  });
  if (!parsed.success) {
    throw new OfflineSyncSubmitError('Expense draft failed validation.');
  }

  const created = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: expenses.id, updatedAt: expenses.updatedAt })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, context.organizationId),
          like(expenses.notes, markerPattern),
          isNull(expenses.archivedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt };
    }
    return createExpense(context, parsed.data);
  });
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

async function submitTimeEntry(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  // Time entries are create-only from the product form. Financial cost snapshot
  // is always server-validated — never invent success offline.
  if (action.serverId) {
    throw new OfflineSyncSubmitError(
      'Time entry updates are not supported offline; keep as a new draft candidate.',
    );
  }

  const payload = asRecord(action.payload) as TimeEntryDraftPayload;
  const parsed = createTimeEntrySchema.safeParse({
    employeeId: requireString(payload, 'employeeId'),
    workDate: requireString(payload, 'workDate'),
    hours: requireString(payload, 'hours'),
    kind: optionalString(payload, 'kind') ?? 'project',
    projectId: optionalString(payload, 'projectId'),
    workPackageId: optionalString(payload, 'workPackageId'),
    phaseId: optionalString(payload, 'phaseId'),
    timeCodeId: optionalString(payload, 'timeCodeId'),
    description: appendOfflineMarker(optionalString(payload, 'description'), action.localId),
  });
  if (!parsed.success) {
    throw new OfflineSyncSubmitError('Time entry draft failed validation.');
  }

  const created = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: timeEntries.id, updatedAt: timeEntries.updatedAt })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, context.organizationId),
          like(timeEntries.description, markerPattern),
          isNull(timeEntries.archivedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt };
    }
    return createTimeEntry(context, parsed.data);
  });
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

async function submitChangeRequest(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload) as ChangeRequestDraftPayload;
  const changeRequestId = action.serverId ?? optionalString(payload, 'changeRequestId');

  if (changeRequestId) {
    await withOrgContext((context) =>
      updateChangeRequest(context, {
        changeRequestId,
        title: requireString(payload, 'title'),
        description: optionalString(payload, 'description'),
        direction: payload.direction === 'reduction' ? 'reduction' : 'addition',
        requestedAmount: optionalString(payload, 'requestedAmount'),
      }),
    );
    const detail = await withOrgContext((context) =>
      getChangeRequestDetail(context, changeRequestId),
    );
    return { serverId: detail.id, serverUpdatedAt: toIso(detail.updatedAt) };
  }

  const result = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: changeRequests.id, updatedAt: changeRequests.updatedAt })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.organizationId, context.organizationId),
          like(changeRequests.description, markerPattern),
        ),
      )
      .limit(1);
    if (existing) {
      return { changeRequestId: existing.id, updatedAt: existing.updatedAt };
    }
    const created = await createChangeRequest(context, {
      projectId: requireString(payload, 'projectId'),
      title: requireString(payload, 'title'),
      description: appendOfflineMarker(optionalString(payload, 'description'), action.localId),
      direction: payload.direction === 'reduction' ? 'reduction' : 'addition',
      requestedAmount: optionalString(payload, 'requestedAmount'),
    });
    const detail = await getChangeRequestDetail(context, created.changeRequestId);
    return { changeRequestId: detail.id, updatedAt: detail.updatedAt };
  });
  return { serverId: result.changeRequestId, serverUpdatedAt: toIso(result.updatedAt) };
}

async function submitDailyLog(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload) as DailyLogDraftPayload;
  const dailyLogId = action.serverId ?? optionalString(payload, 'dailyLogId');

  if (dailyLogId) {
    const updated = await withOrgContext((context) =>
      updateDailyLog(context, {
        dailyLogId,
        logDate: optionalString(payload, 'logDate') ?? undefined,
        weather: optionalString(payload, 'weather'),
        summary: optionalString(payload, 'summary') ?? undefined,
        workforceNotes: optionalString(payload, 'workforceNotes'),
        blockers: optionalString(payload, 'blockers'),
        workPackageId: optionalString(payload, 'workPackageId'),
      }),
    );
    return { serverId: updated.id, serverUpdatedAt: toIso(updated.updatedAt) };
  }

  const projectId = optionalString(payload, 'projectId');
  if (!projectId) {
    throw new OfflineSyncSubmitError('Daily log draft is missing projectId.');
  }

  const created = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: dailyLogs.id, updatedAt: dailyLogs.updatedAt })
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.organizationId, context.organizationId),
          like(dailyLogs.summary, markerPattern),
        ),
      )
      .limit(1);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt };
    }
    return createDailyLog(context, {
      projectId,
      workPackageId: optionalString(payload, 'workPackageId') ?? undefined,
      logDate: requireString(payload, 'logDate'),
      weather: optionalString(payload, 'weather') ?? undefined,
      summary: appendOfflineMarker(requireString(payload, 'summary'), action.localId),
      workforceNotes: optionalString(payload, 'workforceNotes') ?? undefined,
      blockers: optionalString(payload, 'blockers') ?? undefined,
    });
  });
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

async function submitPunch(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload) as PunchDraftPayload;
  const punchListItemId = action.serverId ?? optionalString(payload, 'punchListItemId');

  if (punchListItemId) {
    const priority = optionalString(payload, 'priority');
    const updated = await withOrgContext((context) =>
      updatePunchListItem(context, {
        punchListItemId,
        title: optionalString(payload, 'title') ?? undefined,
        description: optionalString(payload, 'description'),
        priority:
          priority === 'low' ||
          priority === 'normal' ||
          priority === 'high' ||
          priority === 'critical'
            ? priority
            : undefined,
        location: optionalString(payload, 'location'),
        dueDate: optionalString(payload, 'dueDate'),
        workPackageId: optionalString(payload, 'workPackageId'),
      }),
    );
    return { serverId: updated.id, serverUpdatedAt: toIso(updated.updatedAt) };
  }

  const parsed = createPunchListItemSchema.safeParse({
    projectId: requireString(payload, 'projectId'),
    workPackageId: optionalString(payload, 'workPackageId'),
    title: requireString(payload, 'title'),
    description: appendOfflineMarker(optionalString(payload, 'description'), action.localId),
    priority: optionalString(payload, 'priority') ?? undefined,
    location: optionalString(payload, 'location'),
    dueDate: optionalString(payload, 'dueDate'),
  });
  if (!parsed.success) {
    throw new OfflineSyncSubmitError('Punch draft failed validation.');
  }

  const created = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: punchListItems.id, updatedAt: punchListItems.updatedAt })
      .from(punchListItems)
      .where(
        and(
          eq(punchListItems.organizationId, context.organizationId),
          like(punchListItems.description, markerPattern),
          isNull(punchListItems.archivedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt };
    }
    return createPunchListItem(context, parsed.data);
  });
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

async function submitInspection(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload) as InspectionDraftPayload;
  const inspectionId = action.serverId ?? optionalString(payload, 'inspectionId');

  if (inspectionId) {
    const kind = optionalString(payload, 'kind');
    const updated = await withOrgContext((context) =>
      updateInspection(context, {
        inspectionId,
        title: optionalString(payload, 'title') ?? undefined,
        kind:
          kind === 'general' ||
          kind === 'safety' ||
          kind === 'quality' ||
          kind === 'handover' ||
          kind === 'other'
            ? kind
            : undefined,
        scheduledOn: optionalString(payload, 'scheduledOn'),
        notes: optionalString(payload, 'notes'),
        workPackageId: optionalString(payload, 'workPackageId'),
      }),
    );
    return { serverId: updated.id, serverUpdatedAt: toIso(updated.updatedAt) };
  }

  const parsed = createInspectionSchema.safeParse({
    projectId: requireString(payload, 'projectId'),
    workPackageId: optionalString(payload, 'workPackageId'),
    title: requireString(payload, 'title'),
    kind: optionalString(payload, 'kind') ?? undefined,
    scheduledOn: optionalString(payload, 'scheduledOn'),
    notes: appendOfflineMarker(optionalString(payload, 'notes'), action.localId),
  });
  if (!parsed.success) {
    throw new OfflineSyncSubmitError('Inspection draft failed validation.');
  }

  const created = await withOrgContext(async (context) => {
    const markerPattern = likePatternForOfflineMarker(action.localId);
    const [existing] = await context.db
      .select({ id: inspections.id, updatedAt: inspections.updatedAt })
      .from(inspections)
      .where(
        and(
          eq(inspections.organizationId, context.organizationId),
          like(inspections.notes, markerPattern),
          isNull(inspections.archivedAt),
        ),
      )
      .limit(1);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt };
    }
    return createInspection(context, parsed.data);
  });
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

async function submitFormSubmissionDraft(
  action: QueuedAction,
): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const payload = asRecord(action.payload);
  const submissionId = action.serverId ?? optionalString(payload, 'submissionId');

  if (submissionId) {
    const updated = await withOrgContext(async (context) => {
      const existing = await getFormSubmissionForOrg(context, submissionId);
      const template = await getFormTemplateForOrg(context, existing.templateId);

      const answersFromPayload =
        payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers)
          ? (payload.answers as Record<string, unknown>)
          : parseFormAnswersFromFlatPayload(payload, template.schema.fields);

      return updateFormSubmissionDraft(context, {
        submissionId,
        answers: answersFromPayload,
        acknowledgementName: optionalString(payload, 'acknowledgementName'),
        acknowledgementNote: optionalString(payload, 'acknowledgementNote'),
      });
    });
    return { serverId: updated.id, serverUpdatedAt: toIso(updated.updatedAt) };
  }

  const templateId = requireString(payload, 'templateId');
  const ownerType = requireString(payload, 'ownerType');
  const ownerId = requireString(payload, 'ownerId');
  if (!(FORM_OWNER_TYPES as readonly string[]).includes(ownerType)) {
    throw new OfflineSyncSubmitError('Form draft has an invalid owner type.');
  }

  const created = await withOrgContext((context) =>
    createFormSubmission(context, {
      templateId,
      ownerType: ownerType as (typeof FORM_OWNER_TYPES)[number],
      ownerId,
      offlineClientId: action.localId,
      answers:
        payload.answers && typeof payload.answers === 'object'
          ? (payload.answers as Record<string, unknown>)
          : undefined,
    }),
  );
  return { serverId: created.id, serverUpdatedAt: toIso(created.updatedAt) };
}

function parseFormAnswersFromFlatPayload(
  payload: Record<string, unknown>,
  fields: readonly {
    readonly key: string;
    readonly type: string;
    readonly items?: readonly { readonly key: string }[];
  }[],
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    const name = `answer_${field.key}`;
    switch (field.type) {
      case 'checklist': {
        const checked: Record<string, boolean> = {};
        for (const item of field.items ?? []) {
          const raw = payload[`${name}__${item.key}`];
          checked[item.key] = raw === true || raw === 'true' || raw === 'on';
        }
        answers[field.key] = checked;
        break;
      }
      case 'yes_no': {
        const raw = optionalString(payload, name);
        answers[field.key] = raw === 'yes' ? true : raw === 'no' ? false : null;
        break;
      }
      case 'photo': {
        const raw = optionalString(payload, name);
        if (!raw) {
          answers[field.key] = { documentIds: [] };
          break;
        }
        try {
          answers[field.key] = JSON.parse(raw);
        } catch {
          answers[field.key] = { documentIds: [] };
        }
        break;
      }
      case 'signature': {
        const raw = payload[name];
        answers[field.key] = {
          acknowledged: raw === true || raw === 'true' || raw === 'on',
        };
        break;
      }
      default:
        answers[field.key] = optionalString(payload, name);
    }
  }
  return answers;
}

/**
 * Apply a queued offline draft via existing application modules.
 * Capture blobs are uploaded by the client transport before/alongside this.
 */
export async function submitOfflineDraftAction(input: {
  readonly kind: DraftKind;
  readonly serverId: string | null;
  readonly payload: Record<string, unknown>;
  readonly localId: string;
  readonly organizationId: string;
  readonly userId?: string;
  readonly updatedAt: string;
  readonly syncStatus: QueuedAction['syncStatus'];
  readonly serverUpdatedAt: string | null;
  readonly dedupeKey?: string | null;
}): Promise<{ serverId: string; serverUpdatedAt: string }> {
  const action: QueuedAction = {
    localId: input.localId,
    organizationId: input.organizationId,
    userId: input.userId ?? '',
    kind: input.kind,
    payload: input.payload,
    updatedAt: input.updatedAt,
    syncStatus: input.syncStatus,
    serverId: input.serverId,
    serverUpdatedAt: input.serverUpdatedAt,
    dedupeKey: input.dedupeKey ?? null,
  };

  try {
    // Never apply a draft queued for org A / user B while the session differs.
    await withOrgContext(async (context) => {
      if (input.organizationId !== context.organizationId) {
        throw new OfflineSyncSubmitError(
          'Offline draft organization does not match the active organization.',
        );
      }
      if (input.userId && input.userId !== context.userId) {
        throw new OfflineSyncSubmitError(
          'Offline draft user does not match the active user.',
        );
      }
    });

    switch (input.kind) {
      case 'expense':
        return await submitExpense(action);
      case 'time_entry':
        return await submitTimeEntry(action);
      case 'change_request':
        return await submitChangeRequest(action);
      case 'daily_log':
        return await submitDailyLog(action);
      case 'punch':
        return await submitPunch(action);
      case 'inspection':
        return await submitInspection(action);
      case 'form_submission':
        return await submitFormSubmissionDraft(action);
      case 'capture':
        throw new OfflineSyncSubmitError(
          'Capture drafts must be submitted by the client transport with the blob.',
        );
      default:
        throw new OfflineSyncSubmitError(`Unsupported draft kind: ${String(input.kind)}`);
    }
  } catch (error) {
    mapSubmitError(error);
  }
}
