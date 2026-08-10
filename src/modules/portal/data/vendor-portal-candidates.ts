/**
 * Vendor portal candidates persistence facade.
 * Drizzle when ready; otherwise TEST DOUBLE in-memory (non-durable).
 * mutates_financial_truth is always false.
 */

import type { OrgContext } from '@/shared/auth/context';
import { arePortalCandidatesAvailable } from '../domain/candidates-persistence';
import {
  assertGrantSameOrgAndPrincipal,
  assertVendorSameOrg,
} from './candidate-same-org-guards';
import type {
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
} from '../domain/types';
import {
  insertVendorApBillCandidate as insertApInMemory,
  insertVendorComplianceUploadCandidate as insertComplianceInMemory,
  listAllVendorApBillCandidates as listAllApInMemory,
  listAllVendorComplianceCandidates as listAllComplianceInMemory,
  listVendorApBillCandidatesForVendor as listApInMemory,
  listVendorComplianceCandidatesForVendor as listComplianceInMemory,
  reviewVendorApBillCandidate as reviewApInMemory,
  reviewVendorComplianceCandidate as reviewComplianceInMemory,
} from './vendor-portal-candidates.store';
import {
  drizzleVendorPortalCandidatesRepository,
  type ApCandidateInsert,
  type ComplianceCandidateInsert,
  type VendorPortalCandidatesRepository,
} from './vendor-portal-candidates.repository';

let activeRepository: VendorPortalCandidatesRepository | null = null;

export function setVendorPortalCandidatesRepositoryForTests(
  repo: VendorPortalCandidatesRepository | null,
): void {
  activeRepository = repo;
}

export function getVendorPortalCandidatesRepository(): VendorPortalCandidatesRepository {
  return activeRepository ?? drizzleVendorPortalCandidatesRepository;
}

async function assertCandidateAnchors(
  context: OrgContext,
  input: {
    vendorId: string;
    grantId: string;
    principalId: string;
  },
): Promise<void> {
  await assertVendorSameOrg(context.db, context.organizationId, input.vendorId);
  await assertGrantSameOrgAndPrincipal({
    db: context.db,
    organizationId: context.organizationId,
    grantId: input.grantId,
    vendorId: input.vendorId,
    principalId: input.principalId,
  });
}

export async function insertVendorApBillCandidateRow(
  context: OrgContext,
  input: Omit<ApCandidateInsert, 'organizationId'>,
): Promise<VendorApBillCandidate> {
  if (arePortalCandidatesAvailable()) {
    await assertCandidateAnchors(context, input);
    return getVendorPortalCandidatesRepository().insertAp(context.db, {
      ...input,
      organizationId: context.organizationId,
    });
  }
  return insertApInMemory({
    organizationId: context.organizationId,
    ...input,
  });
}

export async function insertVendorComplianceCandidateRow(
  context: OrgContext,
  input: Omit<ComplianceCandidateInsert, 'organizationId'>,
): Promise<VendorComplianceUploadCandidate> {
  if (arePortalCandidatesAvailable()) {
    await assertCandidateAnchors(context, input);
    return getVendorPortalCandidatesRepository().insertCompliance(context.db, {
      ...input,
      organizationId: context.organizationId,
    });
  }
  return insertComplianceInMemory({
    organizationId: context.organizationId,
    ...input,
  });
}

export async function listVendorApBillCandidatesForVendorRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  vendorId: string,
): Promise<VendorApBillCandidate[]> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().listApForVendor(
      context.db,
      context.organizationId,
      vendorId,
    );
  }
  return listApInMemory(context.organizationId, vendorId);
}

export async function listVendorComplianceCandidatesForVendorRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  vendorId: string,
): Promise<VendorComplianceUploadCandidate[]> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().listComplianceForVendor(
      context.db,
      context.organizationId,
      vendorId,
    );
  }
  return listComplianceInMemory(context.organizationId, vendorId);
}

export async function listAllVendorApBillCandidatesRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
): Promise<VendorApBillCandidate[]> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().listAllAp(context.db, context.organizationId);
  }
  return listAllApInMemory(context.organizationId);
}

export async function listAllVendorComplianceCandidatesRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
): Promise<VendorComplianceUploadCandidate[]> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().listAllCompliance(
      context.db,
      context.organizationId,
    );
  }
  return listAllComplianceInMemory(context.organizationId);
}

export async function reviewVendorApBillCandidateRow(
  context: OrgContext,
  input: {
    candidateId: string;
    decision: 'accepted_for_review' | 'rejected';
    reviewNote?: string | null;
  },
): Promise<VendorApBillCandidate | null> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().reviewAp(context.db, {
      organizationId: context.organizationId,
      ...input,
    });
  }
  return reviewApInMemory({
    organizationId: context.organizationId,
    ...input,
  });
}

export async function reviewVendorComplianceCandidateRow(
  context: OrgContext,
  input: {
    candidateId: string;
    decision: 'accepted_for_review' | 'rejected';
    reviewNote?: string | null;
  },
): Promise<VendorComplianceUploadCandidate | null> {
  if (arePortalCandidatesAvailable()) {
    return getVendorPortalCandidatesRepository().reviewCompliance(context.db, {
      organizationId: context.organizationId,
      ...input,
    });
  }
  return reviewComplianceInMemory({
    organizationId: context.organizationId,
    ...input,
  });
}
