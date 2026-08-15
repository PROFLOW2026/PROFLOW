import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import {
  SAVED_LIST_VIEWS_PER_LIST_MAX,
  type SavedListKey,
  type SavedListViewRecord,
} from '../domain/saved-list-views';
import {
  clearDefaultSavedListViews,
  deleteSavedListViewById,
  findSavedListViewById,
  findSavedListViewByName,
  insertSavedListView,
  listSavedListViewsForUser,
  updateSavedListViewById,
} from '../data/saved-list-views.repository';
import {
  deleteSavedListViewSchema,
  saveSavedListViewSchema,
  type SaveSavedListViewInput,
} from '../validation/saved-list-views';

export async function listSavedListViews(
  context: OrgContext,
  listKey: SavedListKey,
): Promise<SavedListViewRecord[]> {
  return listSavedListViewsForUser(context.db, context.organizationId, context.userId, listKey);
}

export async function saveSavedListView(
  context: OrgContext,
  rawInput: SaveSavedListViewInput,
): Promise<SavedListViewRecord> {
  const parsed = saveSavedListViewSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findSavedListViewByName(
    context.db,
    context.organizationId,
    context.userId,
    input.listKey,
    input.name,
  );

  if (!existing) {
    const current = await listSavedListViewsForUser(
      context.db,
      context.organizationId,
      context.userId,
      input.listKey,
    );
    if (current.length >= SAVED_LIST_VIEWS_PER_LIST_MAX) {
      throw new DomainRuleError('Too many saved views', 'common.savedViews.limitReached');
    }
  }

  if (input.isDefault) {
    await clearDefaultSavedListViews(
      context.db,
      context.organizationId,
      context.userId,
      input.listKey,
    );
  }

  if (existing) {
    const updated = await updateSavedListViewById(
      context.db,
      context.organizationId,
      context.userId,
      existing.id,
      {
        query: input.query,
        isDefault: input.isDefault,
      },
    );
    if (!updated) throw new NotFoundError('Saved view');
    return updated;
  }

  return insertSavedListView(context.db, {
    organizationId: context.organizationId,
    userId: context.userId,
    listKey: input.listKey,
    name: input.name,
    query: input.query,
    isDefault: input.isDefault,
  });
}

export async function deleteSavedListView(context: OrgContext, rawId: string): Promise<void> {
  const parsed = deleteSavedListViewSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSavedListViewById(
    context.db,
    context.organizationId,
    context.userId,
    parsed.data.id,
  );
  if (!existing) throw new NotFoundError('Saved view');

  await deleteSavedListViewById(
    context.db,
    context.organizationId,
    context.userId,
    parsed.data.id,
  );
}
