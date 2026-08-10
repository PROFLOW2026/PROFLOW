/**
 * TEST DOUBLE ONLY — process-local vendor portal candidate store.
 *
 * Candidates are never written to ap_bills / expenses / payments.
 * Not durable across instances. Production default when
 * `PORTAL_CANDIDATES_PERSISTENCE_READY` is true uses Drizzle.
 * Public portal login remains DISABLED.
 */

import { randomUUID } from 'node:crypto';
import type {
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
} from '../domain/types';

const apCandidatesByOrg = new Map<string, Map<string, VendorApBillCandidate>>();
const complianceCandidatesByOrg = new Map<
  string,
  Map<string, VendorComplianceUploadCandidate>
>();

function bucket<T>(
  map: Map<string, Map<string, T>>,
  organizationId: string,
): Map<string, T> {
  let org = map.get(organizationId);
  if (!org) {
    org = new Map();
    map.set(organizationId, org);
  }
  return org;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resetVendorPortalCandidateStoreForTests(): void {
  apCandidatesByOrg.clear();
  complianceCandidatesByOrg.clear();
}

export function insertVendorApBillCandidate(input: {
  organizationId: string;
  vendorId: string;
  grantId: string;
  principalId: string;
  reference?: string | null;
  currency: string;
  totalAmount: string;
  billDate?: string | null;
  notes?: string | null;
  lines: readonly {
    description: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
  }[];
}): VendorApBillCandidate {
  const candidate: VendorApBillCandidate = {
    id: randomUUID(),
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
    createdAt: nowIso(),
  };
  bucket(apCandidatesByOrg, input.organizationId).set(candidate.id, candidate);
  return candidate;
}

export function listVendorApBillCandidatesForVendor(
  organizationId: string,
  vendorId: string,
): VendorApBillCandidate[] {
  const org = apCandidatesByOrg.get(organizationId);
  if (!org) return [];
  return [...org.values()]
    .filter((row) => row.vendorId === vendorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function insertVendorComplianceUploadCandidate(input: {
  organizationId: string;
  vendorId: string;
  grantId: string;
  principalId: string;
  artifactKind: VendorComplianceUploadCandidate['artifactKind'];
  name: string;
  referenceNumber?: string | null;
  expiresOn?: string | null;
  notes?: string | null;
}): VendorComplianceUploadCandidate {
  const candidate: VendorComplianceUploadCandidate = {
    id: randomUUID(),
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
    createdAt: nowIso(),
  };
  bucket(complianceCandidatesByOrg, input.organizationId).set(candidate.id, candidate);
  return candidate;
}

export function listVendorComplianceCandidatesForVendor(
  organizationId: string,
  vendorId: string,
): VendorComplianceUploadCandidate[] {
  const org = complianceCandidatesByOrg.get(organizationId);
  if (!org) return [];
  return [...org.values()]
    .filter((row) => row.vendorId === vendorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAllVendorApBillCandidates(
  organizationId: string,
): VendorApBillCandidate[] {
  const org = apCandidatesByOrg.get(organizationId);
  if (!org) return [];
  return [...org.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAllVendorComplianceCandidates(
  organizationId: string,
): VendorComplianceUploadCandidate[] {
  const org = complianceCandidatesByOrg.get(organizationId);
  if (!org) return [];
  return [...org.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Internal review only — never creates ap_bills / expenses / compliance artifacts.
 * Accepted_for_review means an operator acknowledged the candidate for later manual work.
 */
export function reviewVendorApBillCandidate(input: {
  organizationId: string;
  candidateId: string;
  decision: 'accepted_for_review' | 'rejected';
  reviewNote?: string | null;
}): VendorApBillCandidate | null {
  const org = apCandidatesByOrg.get(input.organizationId);
  const existing = org?.get(input.candidateId);
  if (!existing) return null;
  const updated: VendorApBillCandidate = {
    ...existing,
    status: input.decision,
    reviewedAt: nowIso(),
    reviewNote: input.reviewNote ?? null,
    mutatesFinancialTruth: false,
  };
  org!.set(updated.id, updated);
  return updated;
}

export function reviewVendorComplianceCandidate(input: {
  organizationId: string;
  candidateId: string;
  decision: 'accepted_for_review' | 'rejected';
  reviewNote?: string | null;
}): VendorComplianceUploadCandidate | null {
  const org = complianceCandidatesByOrg.get(input.organizationId);
  const existing = org?.get(input.candidateId);
  if (!existing) return null;
  const updated: VendorComplianceUploadCandidate = {
    ...existing,
    status: input.decision,
    reviewedAt: nowIso(),
    reviewNote: input.reviewNote ?? null,
    mutatesFinancialTruth: false,
  };
  org!.set(updated.id, updated);
  return updated;
}
