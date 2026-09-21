import type { OrgContext } from '@/shared/auth/context';
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

/** Maps project semantic folders to document categories used for employee folder grants. */
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

export function employeeHasAnyAllowedSemanticFolder(context: OrgContext): boolean {
  if (!isEmployeeAppUser(context)) return true;
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return false;
  const allowed = context.employeeApp?.allowedDocumentCategories;
  if (!allowed || allowed.size === 0) return false;
  return PROJECT_SEMANTIC_FOLDERS.some((folderType) =>
    canAccessSemanticFolder(context, folderType),
  );
}

export function canAccessSemanticFolder(
  context: OrgContext,
  semanticFolderType: SemanticFolderType,
): boolean {
  if (!isProjectSemanticFolderType(semanticFolderType)) return false;
  if (!isEmployeeAppUser(context)) return true;

  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return false;

  const allowed = context.employeeApp?.allowedDocumentCategories;
  if (!allowed || allowed.size === 0) return false;

  const mapped = categoriesForSemanticFolder(semanticFolderType);
  return mapped.some((category) => allowed.has(category));
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
  if (!isEmployeeAppUser(context)) return shortcuts;
  return shortcuts.filter((shortcut) => canAccessSemanticFolder(context, shortcut.semanticFolderType));
}
