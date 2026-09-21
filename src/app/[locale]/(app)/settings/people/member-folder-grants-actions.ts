'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DOCUMENT_CATEGORIES, isDocumentCategory, type DocumentCategory } from '@/modules/documents/domain/categories';
import { replaceOrgMemberDocumentCategoryGrants } from '@/modules/employee-app';
import type { SettingsActionState } from '../actions';

function parseSelectedCategories(formData: FormData): ReadonlyMap<DocumentCategory, boolean> {
  const selected = new Set(
    formData
      .getAll('categories')
      .map((value) => String(value))
      .filter(isDocumentCategory),
  );
  return new Map(DOCUMENT_CATEGORIES.map((category) => [category, selected.has(category)]));
}

export async function saveMemberDocumentFolderGrantsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!membershipId) return { error: 'Member is required' };

  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
      const categories = parseSelectedCategories(formData);
      const allSelected = DOCUMENT_CATEGORIES.every((category) => categories.get(category));
      const grantsToPersist = allSelected
        ? new Map<DocumentCategory, boolean>()
        : new Map(
            DOCUMENT_CATEGORIES.map(
              (category) => [category, categories.get(category) ?? false] as const,
            ),
          );
      await replaceOrgMemberDocumentCategoryGrants(
        context.db,
        context.organizationId,
        membershipId,
        grantsToPersist,
        context.userId,
      );
    });
    revalidatePath('/settings/people');
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to save folder access',
    };
  }
}
