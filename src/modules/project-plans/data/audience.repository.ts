import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  documentLinks,
  documents,
  externalAccessGrants,
  externalPrincipals,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ContractorAudienceOptions } from '../domain/types';

/**
 * Trusted reads (elevated executor, called only after `documents.share` / `documents.view` was
 * asserted on the project). Only non-financial columns are selected - never agreement amounts.
 */

export async function listProjectAgreements(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ContractorAudienceOptions['agreements']> {
  const rows = await db
    .select({
      id: subcontractAgreements.id,
      title: subcontractAgreements.title,
      number: subcontractAgreements.subcontractNumber,
      vendorId: subcontractAgreements.vendorId,
      vendorName: vendors.name,
    })
    .from(subcontractAgreements)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        ne(subcontractAgreements.status, 'cancelled'),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .orderBy(asc(vendors.name), asc(subcontractAgreements.title))
    .limit(500);
  return rows.map((row) => ({ ...row, number: row.number ?? null, vendorName: row.vendorName ?? null }));
}

/** Contractor principals with an active grant that reaches the project (project-scoped or via an agreement there). */
export async function listProjectPrincipals(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ContractorAudienceOptions['principals']> {
  const agreements = await listProjectAgreements(db, organizationId, projectId);
  const vendorIds = [...new Set(agreements.map((agreement) => agreement.vendorId))];
  const reach = vendorIds.length
    ? or(eq(externalAccessGrants.projectId, projectId), and(isNull(externalAccessGrants.projectId), inArray(externalAccessGrants.vendorId, vendorIds)))
    : eq(externalAccessGrants.projectId, projectId);
  const rows = await db
    .select({
      id: externalPrincipals.id,
      displayName: externalPrincipals.displayName,
      email: externalPrincipals.email,
      vendorId: externalAccessGrants.vendorId,
      vendorName: vendors.name,
    })
    .from(externalAccessGrants)
    .innerJoin(externalPrincipals, eq(externalPrincipals.id, externalAccessGrants.principalId))
    .leftJoin(
      vendors,
      and(eq(vendors.id, externalAccessGrants.vendorId), eq(vendors.organizationId, externalAccessGrants.organizationId)),
    )
    .where(
      and(
        eq(externalAccessGrants.organizationId, organizationId),
        eq(externalAccessGrants.portalKind, 'contractor'),
        eq(externalAccessGrants.status, 'active'),
        isNull(externalAccessGrants.revokedAt),
        isNull(externalPrincipals.archivedAt),
        reach,
      ),
    )
    .orderBy(asc(externalPrincipals.displayName))
    .limit(500);
  const seen = new Set<string>();
  const result: ContractorAudienceOptions['principals'][number][] = [];
  for (const row of rows) {
    if (!row.vendorId || seen.has(row.id)) continue;
    seen.add(row.id);
    result.push({ ...row, vendorId: row.vendorId, vendorName: row.vendorName ?? null });
  }
  return result;
}

export interface ShareableDocument {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
  readonly label: string | null;
  readonly createdAt: string;
}

/** Available documents attached to the project or to one of its agreements (the files a share can point at). */
export async function listShareableProjectDocuments(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  limit = 200,
): Promise<ShareableDocument[]> {
  const agreements = await listProjectAgreements(db, organizationId, projectId);
  const owner = agreements.length
    ? or(
        and(eq(documentLinks.ownerType, 'project'), eq(documentLinks.ownerId, projectId)),
        and(
          eq(documentLinks.ownerType, 'subcontract_agreement'),
          inArray(
            documentLinks.ownerId,
            agreements.map((agreement) => agreement.id),
          ),
        ),
      )
    : and(eq(documentLinks.ownerType, 'project'), eq(documentLinks.ownerId, projectId));
  const rows = await db
    .selectDistinctOn([documents.id], {
      id: documents.id,
      fileName: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      label: documentLinks.label,
      createdAt: documents.createdAt,
      privacyClass: documents.privacyClass,
    })
    .from(documentLinks)
    .innerJoin(
      documents,
      and(eq(documents.id, documentLinks.documentId), eq(documents.organizationId, documentLinks.organizationId)),
    )
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        owner,
        eq(documents.status, 'available'),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(documents.id, desc(documents.createdAt))
    .limit(limit);
  return rows
    .filter((row) => row.privacyClass === 'standard')
    .map((row) => ({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes ?? null,
      label: row.label ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** True when the document is attached to the project (or one of its agreements) and available. */
export async function findShareableProjectDocument(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  documentId: string,
): Promise<ShareableDocument | null> {
  const agreements = await listProjectAgreements(db, organizationId, projectId);
  const rows = await db
    .select({
      id: documents.id,
      fileName: documents.originalFilename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      label: documentLinks.label,
      createdAt: documents.createdAt,
      privacyClass: documents.privacyClass,
      ownerType: documentLinks.ownerType,
      ownerId: documentLinks.ownerId,
    })
    .from(documentLinks)
    .innerJoin(
      documents,
      and(eq(documents.id, documentLinks.documentId), eq(documents.organizationId, documentLinks.organizationId)),
    )
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documentLinks.documentId, documentId),
        eq(documents.status, 'available'),
        isNull(documents.deletedAt),
      ),
    );
  const agreementIds = new Set(agreements.map((agreement) => agreement.id));
  const match = rows.find(
    (row) =>
      row.privacyClass === 'standard' &&
      ((row.ownerType === 'project' && row.ownerId === projectId) ||
        (row.ownerType === 'subcontract_agreement' && agreementIds.has(row.ownerId))),
  );
  if (!match) return null;
  return {
    id: match.id,
    fileName: match.fileName,
    mimeType: match.mimeType,
    sizeBytes: match.sizeBytes ?? null,
    label: match.label ?? null,
    createdAt: match.createdAt.toISOString(),
  };
}

export async function findProjectAgreement(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  agreementId: string,
): Promise<{ id: string; vendorId: string } | null> {
  const [row] = await db
    .select({ id: subcontractAgreements.id, vendorId: subcontractAgreements.vendorId })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        eq(subcontractAgreements.id, agreementId),
        ne(subcontractAgreements.status, 'cancelled'),
      ),
    )
    .limit(1);
  return row ?? null;
}
