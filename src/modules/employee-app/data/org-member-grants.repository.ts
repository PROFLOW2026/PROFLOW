import { and, eq } from 'drizzle-orm';
import { orgMemberDocumentCategoryGrants } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { isDocumentCategory } from '@/modules/documents/domain/categories';

export async function listOrgMemberDocumentCategoryGrants(
  db: DbExecutor,
  organizationId: string,
  membershipId: string,
): Promise<ReadonlyMap<DocumentCategory, boolean>> {
  const rows = await db
    .select()
    .from(orgMemberDocumentCategoryGrants)
    .where(
      and(
        eq(orgMemberDocumentCategoryGrants.organizationId, organizationId),
        eq(orgMemberDocumentCategoryGrants.membershipId, membershipId),
      ),
    );
  const map = new Map<DocumentCategory, boolean>();
  for (const row of rows) {
    if (isDocumentCategory(row.category)) {
      map.set(row.category, row.allowed);
    }
  }
  return map;
}

export async function replaceOrgMemberDocumentCategoryGrants(
  db: DbExecutor,
  organizationId: string,
  membershipId: string,
  categories: ReadonlyMap<DocumentCategory, boolean>,
  grantedByUserId: string,
): Promise<void> {
  await db
    .delete(orgMemberDocumentCategoryGrants)
    .where(
      and(
        eq(orgMemberDocumentCategoryGrants.organizationId, organizationId),
        eq(orgMemberDocumentCategoryGrants.membershipId, membershipId),
      ),
    );
  if (categories.size === 0) return;
  await db.insert(orgMemberDocumentCategoryGrants).values(
    [...categories.entries()].map(([category, allowed]) => ({
      organizationId,
      membershipId,
      category,
      allowed,
      grantedByUserId,
    })),
  );
}
