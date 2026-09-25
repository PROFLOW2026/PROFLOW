/**
 * Read-only duplicate report for document_requirement_rules.
 *
 * PREPARE ONLY — do not archive/delete rows without explicit Owner approval.
 *
 * Usage (after setting DATABASE_URL to the target org DB):
 *   npx tsx scripts/.probe-document-requirement-duplicates.ts [organizationId]
 */
import { eq } from 'drizzle-orm';
import { documentRequirementRules, organizations } from '@drizzle/schema';
import { findDocumentRequirementDuplicates } from '../src/app/[locale]/(app)/settings/business-catalogs/_lib/document-requirement-groups';
import type { DocumentRequirementView } from '../src/app/[locale]/(app)/settings/business-catalogs/_lib/types';
import { getAdminDb } from '../src/shared/db/client';

async function main() {
  const db = getAdminDb();
  const organizationId = process.argv[2];
  const orgRows = organizationId
    ? [{ id: organizationId }]
    : await db.select({ id: organizations.id }).from(organizations);

  for (const org of orgRows) {
    const rows = await db
      .select()
      .from(documentRequirementRules)
      .where(eq(documentRequirementRules.organizationId, org.id));

    const views: DocumentRequirementView[] = rows
      .filter((row) => row.archivedAt == null)
      .filter(
        (row): row is typeof row & { contextKind: 'vendor_type' | 'subcontract' } =>
          row.contextKind === 'vendor_type' || row.contextKind === 'subcontract',
      )
      .map((row) => ({
        id: row.id,
        contextKind: row.contextKind,
        contextKey: row.contextKey,
        documentTypeKey: row.documentTypeKey,
        label: row.label,
        required: row.required,
        isActive: row.isActive,
      }));

    const duplicates = findDocumentRequirementDuplicates(views);
    const duplicateRowCount = duplicates.reduce((sum, item) => sum + item.duplicateIds.length, 0);

    console.log(
      JSON.stringify(
        {
          organizationId: org.id,
          activeRuleCount: views.length,
          duplicateIdentityCount: duplicates.length,
          duplicateRowCount,
          duplicates,
          groupedVisibleCount: new Set(
            views.map(
              (row) =>
                `${row.documentTypeKey}:${row.label?.trim() ?? ''}:${row.contextKind}:${row.contextKey ?? ''}`,
            ),
          ).size,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
