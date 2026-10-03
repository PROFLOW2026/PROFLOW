import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  documentShareAcknowledgements,
  documentShares,
  externalPrincipals,
  profiles,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { AcknowledgementView, DocumentShareAudience, DocumentShareView } from '../domain/types';

export type DocumentShareRow = typeof documentShares.$inferSelect;

export async function insertDocumentShare(
  db: DbExecutor,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly documentId: string;
    readonly audience: DocumentShareAudience;
    readonly vendorId: string | null;
    readonly subcontractAgreementId: string | null;
    readonly principalId: string | null;
    readonly title: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number | null;
    readonly note: string | null;
    readonly acknowledgementRequired: boolean;
    readonly sharedByUserId: string;
  },
): Promise<void> {
  await db.insert(documentShares).values(input);
}

export async function findDocumentShare(
  db: DbExecutor,
  organizationId: string,
  shareId: string,
): Promise<DocumentShareRow | null> {
  const [row] = await db
    .select()
    .from(documentShares)
    .where(and(eq(documentShares.organizationId, organizationId), eq(documentShares.id, shareId)))
    .limit(1);
  return row ?? null;
}

export async function findVisibleDocumentShare(db: DbExecutor, shareId: string): Promise<DocumentShareRow | null> {
  const [row] = await db.select().from(documentShares).where(eq(documentShares.id, shareId)).limit(1);
  return row ?? null;
}

export async function findActiveShareForTarget(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly documentId: string;
    readonly audience: DocumentShareAudience;
    readonly subcontractAgreementId: string | null;
    readonly principalId: string | null;
  },
): Promise<DocumentShareRow | null> {
  const conditions = [
    eq(documentShares.organizationId, input.organizationId),
    eq(documentShares.documentId, input.documentId),
    eq(documentShares.audience, input.audience),
    isNull(documentShares.revokedAt),
    input.subcontractAgreementId
      ? eq(documentShares.subcontractAgreementId, input.subcontractAgreementId)
      : isNull(documentShares.subcontractAgreementId),
    input.principalId ? eq(documentShares.principalId, input.principalId) : isNull(documentShares.principalId),
  ];
  const [row] = await db.select().from(documentShares).where(and(...conditions)).limit(1);
  return row ?? null;
}

export async function revokeDocumentShareRow(
  db: DbExecutor,
  organizationId: string,
  shareId: string,
  revokedByUserId: string,
): Promise<boolean> {
  const rows = await db
    .update(documentShares)
    .set({ revokedAt: new Date(), revokedByUserId })
    .where(
      and(
        eq(documentShares.organizationId, organizationId),
        eq(documentShares.id, shareId),
        isNull(documentShares.revokedAt),
      ),
    )
    .returning({ id: documentShares.id });
  return rows.length === 1;
}

async function acknowledgementsByShare(
  db: DbExecutor,
  organizationId: string,
  shareIds: readonly string[],
): Promise<Map<string, AcknowledgementView[]>> {
  const result = new Map<string, AcknowledgementView[]>();
  if (shareIds.length === 0) return result;
  const rows = await db
    .select({
      shareId: documentShareAcknowledgements.shareId,
      principalId: documentShareAcknowledgements.principalId,
      principalName: externalPrincipals.displayName,
      principalEmail: externalPrincipals.email,
      vendorId: documentShareAcknowledgements.vendorId,
      vendorName: vendors.name,
      acknowledgedAt: documentShareAcknowledgements.acknowledgedAt,
    })
    .from(documentShareAcknowledgements)
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, documentShareAcknowledgements.principalId))
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, documentShareAcknowledgements.vendorId),
        eq(vendors.organizationId, documentShareAcknowledgements.organizationId),
      ),
    )
    .where(
      and(
        eq(documentShareAcknowledgements.organizationId, organizationId),
        inArray(documentShareAcknowledgements.shareId, [...shareIds]),
      ),
    );
  for (const row of rows) {
    const list = result.get(row.shareId) ?? [];
    list.push({
      principalId: row.principalId,
      principalName: row.principalName ?? row.principalEmail ?? null,
      vendorId: row.vendorId,
      vendorName: row.vendorName ?? null,
      acknowledgedAt: row.acknowledgedAt.toISOString(),
    });
    result.set(row.shareId, list);
  }
  return result;
}

export async function listDocumentSharesForProject(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly documentId?: string | null;
    readonly includeRevoked?: boolean;
    readonly limit?: number;
  },
): Promise<DocumentShareView[]> {
  const conditions = [
    eq(documentShares.organizationId, input.organizationId),
    eq(documentShares.projectId, input.projectId),
  ];
  if (input.documentId) conditions.push(eq(documentShares.documentId, input.documentId));
  if (!input.includeRevoked) conditions.push(isNull(documentShares.revokedAt));
  const rows = await db
    .select({
      share: documentShares,
      vendorName: vendors.name,
      agreementTitle: subcontractAgreements.title,
      principalName: externalPrincipals.displayName,
      principalEmail: externalPrincipals.email,
      sharedByName: profiles.displayName,
    })
    .from(documentShares)
    .leftJoin(
      vendors,
      and(eq(vendors.id, documentShares.vendorId), eq(vendors.organizationId, documentShares.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, documentShares.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, documentShares.organizationId),
      ),
    )
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, documentShares.principalId))
    .leftJoin(profiles, eq(profiles.id, documentShares.sharedByUserId))
    .where(and(...conditions))
    .orderBy(desc(documentShares.sharedAt))
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));
  const acks = await acknowledgementsByShare(
    db,
    input.organizationId,
    rows.map((row) => row.share.id),
  );
  return rows.map(({ share, ...names }) => ({
    id: share.id,
    projectId: share.projectId,
    documentId: share.documentId,
    audience: share.audience,
    vendorId: share.vendorId ?? null,
    vendorName: names.vendorName ?? null,
    agreementId: share.subcontractAgreementId ?? null,
    agreementTitle: names.agreementTitle ?? null,
    principalId: share.principalId ?? null,
    principalName: names.principalName ?? names.principalEmail ?? null,
    title: share.title,
    fileName: share.fileName,
    mimeType: share.mimeType,
    sizeBytes: share.sizeBytes ?? null,
    note: share.note ?? null,
    acknowledgementRequired: share.acknowledgementRequired,
    sharedByName: names.sharedByName ?? null,
    sharedAt: share.sharedAt.toISOString(),
    revokedAt: share.revokedAt?.toISOString() ?? null,
    acknowledgements: acks.get(share.id) ?? [],
  }));
}

export async function insertShareAcknowledgement(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly shareId: string;
    readonly principalId: string;
    readonly vendorId: string;
  },
): Promise<boolean> {
  const existing = await db
    .select({ id: documentShareAcknowledgements.id })
    .from(documentShareAcknowledgements)
    .where(
      and(
        eq(documentShareAcknowledgements.shareId, input.shareId),
        eq(documentShareAcknowledgements.principalId, input.principalId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(documentShareAcknowledgements).values(input);
  return true;
}

export async function myShareAcknowledgements(
  db: DbExecutor,
  organizationId: string,
  principalId: string,
  shareIds: readonly string[],
): Promise<Map<string, string>> {
  if (shareIds.length === 0) return new Map();
  const rows = await db
    .select({ shareId: documentShareAcknowledgements.shareId, at: documentShareAcknowledgements.acknowledgedAt })
    .from(documentShareAcknowledgements)
    .where(
      and(
        eq(documentShareAcknowledgements.organizationId, organizationId),
        eq(documentShareAcknowledgements.principalId, principalId),
        inArray(documentShareAcknowledgements.shareId, [...shareIds]),
      ),
    );
  return new Map(rows.map((row) => [row.shareId, row.at.toISOString()] as const));
}
