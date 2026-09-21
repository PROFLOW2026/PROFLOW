import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from '@/modules/employee-app/application/load-employee-app-context';
import { PROJECT_SEMANTIC_FOLDERS } from './semantic-folders';
import type { SemanticFolderType } from './types';

type ProjectSemanticFolderType =
  | 'quotes'
  | 'contracts'
  | 'billing'
  | 'vendor_invoices'
  | 'plans'
  | 'photos'
  | 'documents'
  | 'general_files';

/** Maps project semantic folders to document categories used for folder grants. */
export const SEMANTIC_FOLDER_DOCUMENT_CATEGORIES: Readonly<
  Record<ProjectSemanticFolderType, readonly DocumentCategory[]>
> = {
  quotes: ['quote'],
  contracts: ['contract'],
  billing: ['invoice'],
  vendor_invoices: ['invoice', 'receipt'],
  plans: ['drawing'],
  photos: ['photo', 'drawing'],
  documents: ['contract', 'insurance', 'license', 'certificate', 'other'],
  general_files: ['other'],
};

export type SemanticFolderMappingRef = {
  readonly semanticFolderType: SemanticFolderType;
  readonly externalFolderId: string;
  readonly externalParentId: string | null;
  readonly status: 'pending' | 'ready' | 'error';
};

const PROJECT_SEMANTIC_FOLDER_SET = new Set<string>(PROJECT_SEMANTIC_FOLDERS);

export function isProjectSemanticFolderType(
  type: SemanticFolderType,
): type is ProjectSemanticFolderType {
  return PROJECT_SEMANTIC_FOLDER_SET.has(type);
}

export function categoriesForSemanticFolder(
  semanticFolderType: SemanticFolderType,
): readonly DocumentCategory[] {
  if (!isProjectSemanticFolderType(semanticFolderType)) return [];
  return SEMANTIC_FOLDER_DOCUMENT_CATEGORIES[semanticFolderType];
}

/**
 * Effective document category grants for folder and document visibility.
 * - `null` = unrestricted (all categories) when `documents.read` is granted and no
 *   category restriction rows are configured (Main App members OR Employee App).
 * - empty Set = no categories (missing documents.read, or explicit empty allowlist).
 *
 * Category grants are an OPTIONAL narrowing mechanism. An empty DB grant table must
 * not silently mean "see nothing" when documents.read is granted.
 */
export function resolveEffectiveDocumentCategoryGrants(
  context: OrgContext,
): ReadonlySet<DocumentCategory> | null {
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    return new Set<DocumentCategory>();
  }

  if (isEmployeeAppUser(context)) {
    const allowed = context.employeeApp?.allowedDocumentCategories;
    // null = no restriction rows configured → unrestricted under documents.read.
    // empty Set = explicit empty allowlist → deny all categories.
    if (allowed === null || allowed === undefined) return null;
    if (allowed.size === 0) return new Set<DocumentCategory>();
    return allowed;
  }

  const memberGrants = context.documentCategoryGrants;
  if (memberGrants === undefined || memberGrants === null) {
    return null;
  }
  if (memberGrants.size === 0) return new Set<DocumentCategory>();
  return memberGrants;
}

export function resolveAllowedSemanticFolders(
  context: OrgContext,
): readonly ProjectSemanticFolderType[] {
  return (PROJECT_SEMANTIC_FOLDERS as readonly ProjectSemanticFolderType[]).filter((folderType) =>
    canAccessSemanticFolder(context, folderType),
  );
}

export function employeeHasAnyAllowedSemanticFolder(context: OrgContext): boolean {
  if (!isEmployeeAppUser(context)) return true;
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return false;
  return resolveAllowedSemanticFolders(context).length > 0;
}

export function canAccessSemanticFolder(
  context: OrgContext,
  semanticFolderType: SemanticFolderType,
): boolean {
  if (!isProjectSemanticFolderType(semanticFolderType)) return false;

  const grants = resolveEffectiveDocumentCategoryGrants(context);
  if (grants === null) return true;
  if (grants.size === 0) return false;

  const mapped = categoriesForSemanticFolder(semanticFolderType);
  return mapped.some((category) => grants.has(category));
}

/**
 * Resolves which project semantic folder owns `folderId` using provisioned mappings only.
 * Returns null when the folder is project root or not under a mapped semantic folder.
 * Unmapped subfolders require provider parent walks (see browser-service).
 */
export function resolveSemanticFolderForPath(
  folderId: string,
  mappings: readonly SemanticFolderMappingRef[],
): ProjectSemanticFolderType | null {
  const ready = mappings.filter((mapping) => mapping.status === 'ready');
  const byExternalId = new Map(ready.map((mapping) => [mapping.externalFolderId, mapping]));
  const mapping = byExternalId.get(folderId);
  if (!mapping) return null;
  if (mapping.semanticFolderType === 'project_root') return null;
  if (isProjectSemanticFolderType(mapping.semanticFolderType)) {
    return mapping.semanticFolderType;
  }
  return null;
}

export function filterAccessibleSemanticShortcuts<T extends { semanticFolderType: SemanticFolderType }>(
  context: OrgContext,
  shortcuts: readonly T[],
): readonly T[] {
  return shortcuts.filter((shortcut) => canAccessSemanticFolder(context, shortcut.semanticFolderType));
}
