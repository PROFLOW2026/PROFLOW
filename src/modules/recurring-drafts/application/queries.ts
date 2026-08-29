import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates';
import { assertAnyPermission } from '@/shared/permissions/assert';
import {
  ANY_DRAFT_ACCESS_PERMISSIONS,
  assertCanReadDraftKind,
  canReadDraftKind,
} from '../domain/permissions';
import { previewPayloadForRun } from '../domain/payload';
import type {
  RecurringDraftAmountVersionRecord,
  RecurringDraftListFilters,
  RecurringFinancialDraftRecord,
  RecurringFinancialDraftRunRecord,
  StoredDraftPayload,
} from '../domain/types';
import {
  findRecurringDraftById,
  listAmountVersionsForDraft,
  listRecurringDrafts,
  listRunsForDraft,
} from '../data/recurring-drafts.repository';
import { listRecurringDraftsSchema, recurringDraftIdSchema } from '../validation/schemas';
import { parseStoredPayloadLenient } from './parse-payload';

export async function listRecurringDraftsForOrg(
  context: OrgContext,
  rawFilters: RecurringDraftListFilters = {},
): Promise<RecurringFinancialDraftRecord[]> {
  assertAnyPermission(context, ANY_DRAFT_ACCESS_PERMISSIONS);

  const parsed = listRecurringDraftsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const filters = parsed.data;
  if (filters.kind) assertCanReadDraftKind(context, filters.kind);

  const rows = await listRecurringDrafts(context.db, context.organizationId, filters);
  return rows.filter((row) => canReadDraftKind(context, row.draftKind));
}

export async function getRecurringDraftForOrg(
  context: OrgContext,
  draftId: string,
): Promise<RecurringFinancialDraftRecord> {
  const parsed = recurringDraftIdSchema.safeParse({ draftId });
  if (!parsed.success) throw new NotFoundError('Recurring draft');

  const draft = await findRecurringDraftById(context.db, context.organizationId, parsed.data.draftId);
  if (!draft) throw new NotFoundError('Recurring draft');
  assertCanReadDraftKind(context, draft.draftKind);
  return draft;
}

export async function getRecurringDraftDetail(
  context: OrgContext,
  draftId: string,
): Promise<{
  draft: RecurringFinancialDraftRecord;
  payload: StoredDraftPayload;
  runs: RecurringFinancialDraftRunRecord[];
  amountVersions: RecurringDraftAmountVersionRecord[];
  preview: ReturnType<typeof previewPayloadForRun>;
}> {
  const draft = await getRecurringDraftForOrg(context, draftId);
  const payload = parseStoredPayloadLenient(draft.draftKind, draft.payloadJson);
  const [runs, amountVersions] = await Promise.all([
    listRunsForDraft(context.db, context.organizationId, draft.id),
    listAmountVersionsForDraft(context.db, context.organizationId, draft.id),
  ]);
  const runDate = todayInTimeZone(context.organization.timezone);
  const preview = previewPayloadForRun(payload, runDate, draft.title);
  return { draft, payload, runs, amountVersions, preview };
}
