import { titleWithDocumentNumber } from '@/modules/tenancy/domain/document-numbers';

/** Canonical user-visible project label: `CNS-27150 - Project name`. */
export function formatProjectDisplayName(
  name: string,
  documentNumber: string | null | undefined,
): string {
  return titleWithDocumentNumber(name, documentNumber ?? '');
}
