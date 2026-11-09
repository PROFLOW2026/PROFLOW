import { AuthorizationError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canMutateSavedListView } from '../domain/saved-list-view-access';
import {
  SAVED_LIST_VIEWS_PER_LIST_MAX,
  type SavedListKey,
  type SavedListViewRecord,
} from '../domain/saved-list-views';
import {
  clearDefaultSavedListViews,
  countSavedListViewsCreatedByUser,
  deleteSavedListViewByIdInOrg,
  findSavedListViewByIdInOrg,
  findSavedListViewByName,
  insertSavedListView,
  listSavedListViewsForOrgMember,
  updateSavedListViewByIdInOrg,
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
  return listSavedListViewsForOrgMember(
    context.db,
    context.organizationId,
    context.userId,
    listKey,
  );
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
  if (input.scope === 'organization') {
    assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  }

  const existing = await findSavedListViewByName(
    context.db,
    context.organizationId,
    context.userId,
    input.listKey,
    input.name,
    input.scope,
  );

  if (existing && !canMutateSavedListView(context, existing)) {
    throw new AuthorizationError('saved_list_view.mutate');
  }

  if (!existing) {
    const count = await countSavedListViewsCreatedByUser(
      context.db,
      context.organizationId,
      context.userId,
      input.listKey,
    );
    if (count >= SAVED_LIST_VIEWS_PER_LIST_MAX) {
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
    const updated = await updateSavedListViewByIdInOrg(
      context.db,
      context.organizationId,
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
    scope: input.scope,
  });
}

export async function deleteSavedListView(context: OrgContext, rawId: string): Promise<void> {
  const parsed = deleteSavedListViewSchema.safeParse({ id: rawId });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSavedListViewByIdInOrg(
    context.db,
    context.organizationId,
    parsed.data.id,
  );
  if (!existing) throw new NotFoundError('Saved view');
  if (!canMutateSavedListView(context, existing)) {
    throw new AuthorizationError('saved_list_view.mutate');
  }

  const deleted = await deleteSavedListViewByIdInOrg(
    context.db,
    context.organizationId,
    parsed.data.id,
  );
  if (!deleted) throw new NotFoundError('Saved view');
}
