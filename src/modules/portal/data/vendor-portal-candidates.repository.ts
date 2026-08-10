/**
 * Drizzle repository for vendor portal AP + compliance candidates.
 * Production path only when `PORTAL_CANDIDATES_PERSISTENCE_READY` is true.
 * Never writes ap_bills / expenses / compliance_artifacts.
 */

import { and, desc, eq } from 'drizzle-orm';
import {
  vendorPortalApCandidates,
  vendorPortalComplianceCandidates,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
} from '../domain/types';

export type ApCandidateLine = {
  readonly description: string;
  readonly quantity: string;
  readonly unitAmount: string;
  readonly lineTotal: string;
};

export interface ApCandidateInsert {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly grantId: string;
  readonly principalId: string;
  readonly reference?: string | null;
  readonly currency: string;
  readonly totalAmount: string;
  readonly billDate?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly ApCandidateLine[];
}

export interface ComplianceCandidateInsert {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly grantId: string;
  readonly principalId: string;
  readonly artifactKind: VendorComplianceUploadCandidate['artifactKind'];
  readonly name: string;
  readonly referenceNumber?: string | null;
  readonly expiresOn?: string | null;
  readonly notes?: string | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function mapAp(row: typeof vendorPortalApCandidates.$inferSelect): VendorApBillCandidate {
  const lines = Array.isArray(row.lines) ? (row.lines as ApCandidateLine[]) : [];
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    grantId: row.grantId,
    principalId: row.principalId,
    reference: row.reference,
    currency: row.currency,
    totalAmount: row.totalAmount,
    billDate: row.billDate,
    notes: row.notes,
    lines: lines.map((line) => ({ ...line })),
    status: row.status as VendorApBillCandidate['status'],
    mutatesFinancialTruth: false,
    createdAt: toIso(row.createdAt)!,
    reviewedAt: toIso(row.reviewedAt),
    reviewNote: row.reviewNote,
  };
}

function mapCompliance(
  row: typeof vendorPortalComplianceCandidates.$inferSelect,
): VendorComplianceUploadCandidate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    grantId: row.grantId,
    principalId: row.principalId,
    artifactKind: row.artifactKind as VendorComplianceUploadCandidate['artifactKind'],
    name: row.name,
    referenceNumber: row.referenceNumber,
    expiresOn: row.expiresOn,
    notes: row.notes,
    status: row.status as VendorComplianceUploadCandidate['status'],
    mutatesFinancialTruth: false,
    createdAt: toIso(row.createdAt)!,
    reviewedAt: toIso(row.reviewedAt),
    reviewNote: row.reviewNote,
  };
}

export interface VendorPortalCandidatesRepository {
  insertAp(db: DbExecutor, input: ApCandidateInsert): Promise<VendorApBillCandidate>;
  listApForVendor(
    db: DbExecutor,
    organizationId: string,
    vendorId: string,
  ): Promise<VendorApBillCandidate[]>;
  listAllAp(db: DbExecutor, organizationId: string): Promise<VendorApBillCandidate[]>;
  reviewAp(
    db: DbExecutor,
    input: {
      organizationId: string;
      candidateId: string;
      decision: 'accepted_for_review' | 'rejected';
      reviewNote?: string | null;
    },
  ): Promise<VendorApBillCandidate | null>;
  insertCompliance(
    db: DbExecutor,
    input: ComplianceCandidateInsert,
  ): Promise<VendorComplianceUploadCandidate>;
  listComplianceForVendor(
    db: DbExecutor,
    organizationId: string,
    vendorId: string,
  ): Promise<VendorComplianceUploadCandidate[]>;
  listAllCompliance(
    db: DbExecutor,
    organizationId: string,
  ): Promise<VendorComplianceUploadCandidate[]>;
  reviewCompliance(
    db: DbExecutor,
    input: {
      organizationId: string;
      candidateId: string;
      decision: 'accepted_for_review' | 'rejected';
      reviewNote?: string | null;
    },
  ): Promise<VendorComplianceUploadCandidate | null>;
}

export const drizzleVendorPortalCandidatesRepository: VendorPortalCandidatesRepository = {
  async insertAp(db, input) {
    const [row] = await db
      .insert(vendorPortalApCandidates)
      .values({
        organizationId: input.organizationId,
        vendorId: input.vendorId,
        grantId: input.grantId,
        principalId: input.principalId,
        reference: input.reference ?? null,
        currency: input.currency.toUpperCase(),
        totalAmount: input.totalAmount,
        billDate: input.billDate ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({ ...line })),
        status: 'candidate',
        mutatesFinancialTruth: false,
      })
      .returning();
    if (!row) throw new Error('Failed to insert vendor_portal_ap_candidate');
    return mapAp(row);
  },

  async listApForVendor(db, organizationId, vendorId) {
    const rows = await db
      .select()
      .from(vendorPortalApCandidates)
      .where(
        and(
          eq(vendorPortalApCandidates.organizationId, organizationId),
          eq(vendorPortalApCandidates.vendorId, vendorId),
        ),
      )
      .orderBy(desc(vendorPortalApCandidates.createdAt));
    return rows.map(mapAp);
  },

  async listAllAp(db, organizationId) {
    const rows = await db
      .select()
      .from(vendorPortalApCandidates)
      .where(eq(vendorPortalApCandidates.organizationId, organizationId))
      .orderBy(desc(vendorPortalApCandidates.createdAt));
    return rows.map(mapAp);
  },

  async reviewAp(db, input) {
    const now = new Date();
    const [row] = await db
      .update(vendorPortalApCandidates)
      .set({
        status: input.decision,
        reviewedAt: now,
        reviewNote: input.reviewNote ?? null,
        mutatesFinancialTruth: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(vendorPortalApCandidates.organizationId, input.organizationId),
          eq(vendorPortalApCandidates.id, input.candidateId),
        ),
      )
      .returning();
    return row ? mapAp(row) : null;
  },

  async insertCompliance(db, input) {
    const [row] = await db
      .insert(vendorPortalComplianceCandidates)
      .values({
        organizationId: input.organizationId,
        vendorId: input.vendorId,
        grantId: input.grantId,
        principalId: input.principalId,
        artifactKind: input.artifactKind,
        name: input.name,
        referenceNumber: input.referenceNumber ?? null,
        expiresOn: input.expiresOn ?? null,
        notes: input.notes ?? null,
        status: 'candidate',
        mutatesFinancialTruth: false,
      })
      .returning();
    if (!row) throw new Error('Failed to insert vendor_portal_compliance_candidate');
    return mapCompliance(row);
  },

  async listComplianceForVendor(db, organizationId, vendorId) {
    const rows = await db
      .select()
      .from(vendorPortalComplianceCandidates)
      .where(
        and(
          eq(vendorPortalComplianceCandidates.organizationId, organizationId),
          eq(vendorPortalComplianceCandidates.vendorId, vendorId),
        ),
      )
      .orderBy(desc(vendorPortalComplianceCandidates.createdAt));
    return rows.map(mapCompliance);
  },

  async listAllCompliance(db, organizationId) {
    const rows = await db
      .select()
      .from(vendorPortalComplianceCandidates)
      .where(eq(vendorPortalComplianceCandidates.organizationId, organizationId))
      .orderBy(desc(vendorPortalComplianceCandidates.createdAt));
    return rows.map(mapCompliance);
  },

  async reviewCompliance(db, input) {
    const now = new Date();
    const [row] = await db
      .update(vendorPortalComplianceCandidates)
      .set({
        status: input.decision,
        reviewedAt: now,
        reviewNote: input.reviewNote ?? null,
        mutatesFinancialTruth: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(vendorPortalComplianceCandidates.organizationId, input.organizationId),
          eq(vendorPortalComplianceCandidates.id, input.candidateId),
        ),
      )
      .returning();
    return row ? mapCompliance(row) : null;
  },
};
