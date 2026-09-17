import { and, eq } from 'drizzle-orm';
import {
  employeeDocumentCategoryGrants,
  employeePermissionGrants,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { isDocumentCategory } from '@/modules/documents/domain/categories';
import { isPermissionKey, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { EmployeePermissionGrantRecord } from '../domain/types';

export async function listEmployeePermissionGrants(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<EmployeePermissionGrantRecord[]> {
  const rows = await db
    .select()
    .from(employeePermissionGrants)
    .where(
      and(
        eq(employeePermissionGrants.organizationId, organizationId),
        eq(employeePermissionGrants.employeeId, employeeId),
      ),
    );
  return rows.flatMap((row) => {
    if (!isPermissionKey(row.permissionKey)) return [];
    return [
      {
        permissionKey: row.permissionKey,
        scope: row.scope as PermissionScope,
        granted: row.granted,
      },
    ];
  });
}

export async function upsertEmployeePermissionGrant(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    permissionKey: PermissionKey;
    scope: PermissionScope;
    granted: boolean;
    grantedByUserId: string;
  },
): Promise<void> {
  await db
    .insert(employeePermissionGrants)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      permissionKey: input.permissionKey,
      scope: input.scope,
      granted: input.granted,
      grantedByUserId: input.grantedByUserId,
    })
    .onConflictDoUpdate({
      target: [
        employeePermissionGrants.organizationId,
        employeePermissionGrants.employeeId,
        employeePermissionGrants.permissionKey,
      ],
      set: {
        scope: input.scope,
        granted: input.granted,
        grantedByUserId: input.grantedByUserId,
        updatedAt: new Date(),
      },
    });
}

export async function deleteEmployeePermissionGrants(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<void> {
  await db
    .delete(employeePermissionGrants)
    .where(
      and(
        eq(employeePermissionGrants.organizationId, organizationId),
        eq(employeePermissionGrants.employeeId, employeeId),
      ),
    );
}

export async function listEmployeeDocumentCategoryGrants(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<ReadonlyMap<DocumentCategory, boolean>> {
  const rows = await db
    .select()
    .from(employeeDocumentCategoryGrants)
    .where(
      and(
        eq(employeeDocumentCategoryGrants.organizationId, organizationId),
        eq(employeeDocumentCategoryGrants.employeeId, employeeId),
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

export async function upsertEmployeeDocumentCategoryGrant(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    category: DocumentCategory;
    allowed: boolean;
    grantedByUserId: string;
  },
): Promise<void> {
  await db
    .insert(employeeDocumentCategoryGrants)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      category: input.category,
      allowed: input.allowed,
      grantedByUserId: input.grantedByUserId,
    })
    .onConflictDoUpdate({
      target: [
        employeeDocumentCategoryGrants.organizationId,
        employeeDocumentCategoryGrants.employeeId,
        employeeDocumentCategoryGrants.category,
      ],
      set: {
        allowed: input.allowed,
        grantedByUserId: input.grantedByUserId,
        updatedAt: new Date(),
      },
    });
}

export async function replaceEmployeeDocumentCategoryGrants(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  categories: ReadonlyMap<DocumentCategory, boolean>,
  grantedByUserId: string,
): Promise<void> {
  await db
    .delete(employeeDocumentCategoryGrants)
    .where(
      and(
        eq(employeeDocumentCategoryGrants.organizationId, organizationId),
        eq(employeeDocumentCategoryGrants.employeeId, employeeId),
      ),
    );
  if (categories.size === 0) return;
  await db.insert(employeeDocumentCategoryGrants).values(
    [...categories.entries()].map(([category, allowed]) => ({
      organizationId,
      employeeId,
      category,
      allowed,
      grantedByUserId,
    })),
  );
}
