import {
  EXTERNAL_CAPABILITIES,
  type ExternalCapability,
} from '@/shared/external';
import type { SemanticFolderType } from '@/modules/external-storage/domain/types';

/**
 * Contractor folder permission = one external capability per semantic folder.
 * - plans → existing ext.plan.view (1:1; drawings register + plans folder bytes)
 * - other project folders → ext.folder.<type> (custom grant only; not bundled)
 * Unmapped / org-level folder types stay closed.
 */
export const CONTRACTOR_SEMANTIC_FOLDER_CAPABILITY: Readonly<
  Partial<Record<SemanticFolderType, ExternalCapability>>
> = {
  plans: EXTERNAL_CAPABILITIES.PLAN_VIEW,
  quotes: EXTERNAL_CAPABILITIES.FOLDER_QUOTES,
  contracts: EXTERNAL_CAPABILITIES.FOLDER_CONTRACTS,
  billing: EXTERNAL_CAPABILITIES.FOLDER_BILLING,
  vendor_invoices: EXTERNAL_CAPABILITIES.FOLDER_VENDOR_INVOICES,
  photos: EXTERNAL_CAPABILITIES.FOLDER_PHOTOS,
  documents: EXTERNAL_CAPABILITIES.FOLDER_DOCUMENTS,
  general_files: EXTERNAL_CAPABILITIES.FOLDER_GENERAL_FILES,
};

export function capabilityForContractorFolder(
  folder: SemanticFolderType,
): ExternalCapability | null {
  return CONTRACTOR_SEMANTIC_FOLDER_CAPABILITY[folder] ?? null;
}

export function contractorFoldersForCapability(
  capability: ExternalCapability,
): readonly SemanticFolderType[] {
  return (Object.entries(CONTRACTOR_SEMANTIC_FOLDER_CAPABILITY) as Array<
    [SemanticFolderType, ExternalCapability]
  >)
    .filter(([, required]) => required === capability)
    .map(([folder]) => folder);
}

/** Non-plans project folders that may appear on the portal documents/files surface. */
export const CONTRACTOR_PORTAL_FILE_FOLDERS = [
  'quotes',
  'contracts',
  'billing',
  'vendor_invoices',
  'photos',
  'documents',
  'general_files',
] as const satisfies readonly SemanticFolderType[];

export type ContractorPortalFileFolder = (typeof CONTRACTOR_PORTAL_FILE_FOLDERS)[number];
