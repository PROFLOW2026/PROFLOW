import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import {
  complianceArtifacts,
  contractorComplianceDocuments,
  contractorComplianceReminders,
  contractorComplianceRequirements,
  organizations,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ComplianceActorType,
  ComplianceDocumentRecord,
  ComplianceRequirementKind,
  ComplianceRequirementRecord,
  ComplianceReviewStatus,
} from '../domain/types';

const R = contractorComplianceRequirements;
const D = contractorComplianceDocuments;

function mapRequirement(row: typeof R.$inferSelect): ComplianceRequirementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    kind: row.kind as ComplianceRequirementKind,
    title: row.title,
    description: row.description,
    isRequired: row.isRequired,
    blocksPayment: row.blocksPayment,
    requiresExpiry: row.requiresExpiry,
    warningDays: row.warningDays,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

function mapDocument(row: typeof D.$inferSelect): ComplianceDocumentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    requirementId: row.requirementId,
    referenceNumber: row.referenceNumber,
    issuer: row.issuer,
    issuedOn: row.issuedOn,
    expiresOn: row.expiresOn,
    notes: row.notes,
    documentId: row.documentId,
    complianceArtifactId: row.complianceArtifactId,
    submittedActorType: row.submittedActorType as ComplianceActorType,
    submittedByUserId: row.submittedByUserId,
    submittedByPrincipalId: row.submittedByPrincipalId,
    submittedAt: row.submittedAt,
    reviewStatus: row.reviewStatus as ComplianceReviewStatus,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
  };
}

// ── Agreements (operational columns only: never select contract money) ──────────────────────

export interface AgreementScopeRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly title: string;
  readonly status: string;
  readonly vendorName: string;
}

const agreementColumns = {
  id: subcontractAgreements.id,
  organizationId: subcontractAgreements.organizationId,
  projectId: subcontractAgreements.projectId,
  vendorId: subcontractAgreements.vendorId,
  title: subcontractAgreements.title,
  status: subcontractAgreements.status,
  vendorName: vendors.name,
};

interface ScopeFnRow {
  id: string;
  organization_id: string;
  project_id: string;
  vendor_id: string;
  title: string;
  status: string;
  vendor_name: string;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/**
 * Money-free agreement projection (`app.dg_contractor_agreement_scope`, migration 0166): visible to
 * project members with contractor.view and to contractors with ext.project.view on the agreement.
 */
async function agreementScopeProjection(
  db: DbExecutor,
  organizationId: string,
  projectId: string | null,
  agreementId: string | null,
): Promise<AgreementScopeRow[]> {
  const result = await db.execute(
    sql`select * from app.dg_contractor_agreement_scope(${organizationId}::uuid, ${projectId}::uuid, ${agreementId}::uuid)`,
  );
  return rowsOf<ScopeFnRow>(result).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    vendorId: row.vendor_id,
    title: row.title,
    status: row.status,
    vendorName: row.vendor_name,
  }));
}

export async function findAgreementScope(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementScopeRow | null> {
  const [projected] = await agreementScopeProjection(db, organizationId, null, agreementId);
  if (projected) return projected;
  // Service role (workers) and org-level vendors.read holders read the table directly.
  const [row] = await db
    .select(agreementColumns)
    .from(subcontractAgreements)
    .innerJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(and(eq(subcontractAgreements.organizationId, organizationId), eq(subcontractAgreements.id, agreementId)))
    .limit(1);
  return row ?? null;
}

export async function listProjectAgreements(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<AgreementScopeRow[]> {
  const projected = await agreementScopeProjection(db, organizationId, projectId, null);
  if (projected.length > 0) {
    return projected
      .filter((row) => row.status !== 'cancelled')
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.title.localeCompare(b.title));
  }
  return db
    .select(agreementColumns)
    .from(subcontractAgreements)
    .innerJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        isNull(subcontractAgreements.archivedAt),
        ne(subcontractAgreements.status, 'cancelled'),
      ),
    )
    .orderBy(asc(vendors.name), asc(subcontractAgreements.title))
    .limit(500);
}

export async function findOrganizationTimezone(db: DbExecutor, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row?.timezone ?? null;
}

// ── Requirements ─────────────────────────────────────────────────────────────────────────────

export async function listRequirements(
  db: DbExecutor,
  organizationId: string,
  filter: {
    readonly projectId?: string;
    readonly agreementId?: string;
    readonly ids?: readonly string[];
    readonly includeArchived?: boolean;
  },
): Promise<ComplianceRequirementRecord[]> {
  if (filter.ids && filter.ids.length === 0) return [];
  const rows = await db
    .select()
    .from(R)
    .where(
      and(
        eq(R.organizationId, organizationId),
        filter.ids ? inArray(R.id, [...filter.ids]) : undefined,
        filter.projectId ? eq(R.projectId, filter.projectId) : undefined,
        filter.agreementId ? eq(R.subcontractAgreementId, filter.agreementId) : undefined,
        filter.includeArchived ? undefined : isNull(R.archivedAt),
      ),
    )
    .orderBy(asc(R.subcontractAgreementId), asc(R.sortOrder), asc(R.createdAt))
    .limit(2_000);
  return rows.map(mapRequirement);
}

export async function findRequirement(
  db: DbExecutor,
  organizationId: string,
  requirementId: string,
): Promise<ComplianceRequirementRecord | null> {
  const [row] = await db
    .select()
    .from(R)
    .where(and(eq(R.organizationId, organizationId), eq(R.id, requirementId)))
    .limit(1);
  return row ? mapRequirement(row) : null;
}

export interface InsertRequirementRow {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly title: string;
  readonly description: string | null;
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly requiresExpiry: boolean;
  readonly warningDays: number;
  readonly sortOrder: number;
  readonly createdByUserId: string;
}

export async function insertRequirements(
  db: DbExecutor,
  rows: readonly InsertRequirementRow[],
): Promise<ComplianceRequirementRecord[]> {
  if (rows.length === 0) return [];
  const inserted = await db.insert(R).values([...rows]).returning();
  return inserted.map(mapRequirement);
}

export async function nextRequirementSortOrder(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${R.sortOrder})` })
    .from(R)
    .where(and(eq(R.organizationId, organizationId), eq(R.subcontractAgreementId, agreementId)));
  return (row?.max === null || row?.max === undefined ? -1 : Number(row.max)) + 1;
}

export async function updateRequirementRow(
  db: DbExecutor,
  organizationId: string,
  requirementId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    isRequired: boolean;
    blocksPayment: boolean;
    requiresExpiry: boolean;
    warningDays: number;
    archivedAt: Date | null;
  }>,
): Promise<ComplianceRequirementRecord | null> {
  const [row] = await db
    .update(R)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(R.organizationId, organizationId), eq(R.id, requirementId)))
    .returning();
  return row ? mapRequirement(row) : null;
}

// ── Documents (submissions) ──────────────────────────────────────────────────────────────────

export async function listDocumentsForRequirements(
  db: DbExecutor,
  organizationId: string,
  requirementIds: readonly string[],
): Promise<ComplianceDocumentRecord[]> {
  if (requirementIds.length === 0) return [];
  const rows = await db
    .select()
    .from(D)
    .where(and(eq(D.organizationId, organizationId), inArray(D.requirementId, [...requirementIds])))
    .orderBy(desc(D.submittedAt))
    .limit(5_000);
  return rows.map(mapDocument);
}

export async function findDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<ComplianceDocumentRecord | null> {
  const [row] = await db
    .select()
    .from(D)
    .where(and(eq(D.organizationId, organizationId), eq(D.id, documentId)))
    .limit(1);
  return row ? mapDocument(row) : null;
}

export interface InsertDocumentRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
  readonly requirementId: string;
  readonly referenceNumber: string | null;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly notes: string | null;
  readonly documentId: string | null;
  readonly complianceArtifactId: string | null;
  readonly submittedActorType: ComplianceActorType;
  readonly submittedByUserId: string | null;
  readonly submittedByPrincipalId: string | null;
  readonly reviewStatus?: ComplianceReviewStatus;
  readonly reviewedByUserId?: string | null;
  readonly reviewedAt?: Date | null;
  readonly reviewNote?: string | null;
}

/** No RETURNING: external principals insert under RLS and re-read through their own policy. */
export async function insertDocument(db: DbExecutor, row: InsertDocumentRow): Promise<void> {
  await db.insert(D).values(row);
}

export async function reviewDocumentRow(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
  review: { reviewStatus: 'approved' | 'rejected'; reviewedByUserId: string; reviewNote: string | null },
): Promise<ComplianceDocumentRecord | null> {
  const [row] = await db
    .update(D)
    .set({ ...review, reviewedAt: new Date() })
    .where(and(eq(D.organizationId, organizationId), eq(D.id, documentId), eq(D.reviewStatus, 'pending_review')))
    .returning();
  return row ? mapDocument(row) : null;
}

export async function listPendingDocumentsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ComplianceDocumentRecord[]> {
  const rows = await db
    .select()
    .from(D)
    .where(and(eq(D.organizationId, organizationId), eq(D.projectId, projectId), eq(D.reviewStatus, 'pending_review')))
    .orderBy(asc(D.submittedAt))
    .limit(500);
  return rows.map(mapDocument);
}

// ── Existing compliance artifacts (reuse) ────────────────────────────────────────────────────

export interface VendorArtifactRow {
  readonly id: string;
  readonly artifactKind: string;
  readonly name: string;
  readonly referenceNumber: string | null;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly documentId: string | null;
}

function asIsoDate(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function listVendorArtifacts(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<VendorArtifactRow[]> {
  const rows = await db
    .select({
      id: complianceArtifacts.id,
      artifactKind: complianceArtifacts.artifactKind,
      name: complianceArtifacts.name,
      referenceNumber: complianceArtifacts.referenceNumber,
      issuer: complianceArtifacts.issuer,
      issuedOn: complianceArtifacts.issuedOn,
      expiresOn: complianceArtifacts.expiresOn,
      documentId: complianceArtifacts.documentId,
    })
    .from(complianceArtifacts)
    .where(
      and(
        eq(complianceArtifacts.organizationId, organizationId),
        eq(complianceArtifacts.subjectType, 'vendor'),
        eq(complianceArtifacts.subjectId, vendorId),
        isNull(complianceArtifacts.archivedAt),
      ),
    )
    .orderBy(desc(complianceArtifacts.expiresOn))
    .limit(200);
  return rows.map((row) => ({ ...row, issuedOn: asIsoDate(row.issuedOn), expiresOn: asIsoDate(row.expiresOn) }));
}

export async function findVendorArtifact(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
  artifactId: string,
): Promise<VendorArtifactRow | null> {
  const rows = await listVendorArtifacts(db, organizationId, vendorId);
  return rows.find((row) => row.id === artifactId) ?? null;
}

// ── Reminder scan (service role) ─────────────────────────────────────────────────────────────

export interface ExpiryCandidateRow {
  readonly documentId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string;
  readonly requirementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly requiresExpiry: boolean;
  readonly warningDays: number;
  readonly expiresOn: string;
  readonly submittedAt: Date;
}

/** Approved, expiring documents of active requirements with expiry <= horizon. Bounded batch. */
export async function listExpiryCandidates(
  db: DbExecutor,
  input: {
    readonly horizon: string;
    readonly organizationId?: string;
    readonly projectId?: string;
    readonly projectIds?: readonly string[] | null;
    /** When set, only requirements marked required (optional items stay out of Command Center). */
    readonly requiredOnly?: boolean;
    readonly limit: number;
    /** Scan mode: skip documents whose terminal 'expired' reminder was already emitted. */
    readonly excludeExpiredReminded?: boolean;
  },
): Promise<ExpiryCandidateRow[]> {
  if (input.projectIds && input.projectIds.length === 0) return [];
  const rows = await db
    .select({
      documentId: D.id,
      organizationId: D.organizationId,
      projectId: D.projectId,
      vendorId: D.vendorId,
      subcontractAgreementId: D.subcontractAgreementId,
      requirementId: D.requirementId,
      kind: R.kind,
      requiresExpiry: R.requiresExpiry,
      warningDays: R.warningDays,
      expiresOn: D.expiresOn,
      submittedAt: D.submittedAt,
    })
    .from(D)
    .innerJoin(R, and(eq(R.id, D.requirementId), eq(R.organizationId, D.organizationId)))
    .where(
      and(
        eq(D.reviewStatus, 'approved'),
        lte(D.expiresOn, input.horizon),
        isNull(R.archivedAt),
        eq(R.requiresExpiry, true),
        input.organizationId ? eq(D.organizationId, input.organizationId) : undefined,
        input.projectId ? eq(D.projectId, input.projectId) : undefined,
        input.projectIds && input.projectIds.length > 0 ? inArray(D.projectId, [...input.projectIds]) : undefined,
        input.requiredOnly ? eq(R.isRequired, true) : undefined,
        input.excludeExpiredReminded
          ? sql`NOT EXISTS (SELECT 1 FROM ${contractorComplianceReminders} m
              WHERE m.organization_id = ${D.organizationId} AND m.document_id = ${D.id}
                AND m.reminder_kind = 'expired')`
          : undefined,
      ),
    )
    .orderBy(asc(D.expiresOn))
    .limit(input.limit);
  return rows
    .filter((row): row is typeof row & { expiresOn: string } => row.expiresOn !== null)
    .map((row) => ({ ...row, kind: row.kind as ComplianceRequirementKind }));
}

/** Approved documents (any expiry) of the given requirements - to detect a newer replacement. */
export async function listApprovedDocumentsForRequirements(
  db: DbExecutor,
  requirementIds: readonly string[],
): Promise<{ requirementId: string; organizationId: string; expiresOn: string | null; id: string }[]> {
  if (requirementIds.length === 0) return [];
  return db
    .select({ id: D.id, requirementId: D.requirementId, organizationId: D.organizationId, expiresOn: D.expiresOn })
    .from(D)
    .where(and(inArray(D.requirementId, [...requirementIds]), eq(D.reviewStatus, 'approved')));
}

/** Returns true when the reminder row was newly inserted (dedupe by unique index). */
export async function insertReminderIfAbsent(
  db: DbExecutor,
  row: {
    organizationId: string;
    projectId: string;
    requirementId: string;
    documentId: string;
    reminderKind: 'expiring' | 'expired';
    forExpiry: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(contractorComplianceReminders)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: contractorComplianceReminders.id });
  return inserted.length > 0;
}
