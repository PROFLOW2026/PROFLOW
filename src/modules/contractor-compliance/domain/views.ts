import { computeRequirementStatus, countStatuses } from './status';
import { isRequirementBlocking } from './eligibility';
import type {
  AgreementComplianceView,
  ComplianceDocumentRecord,
  ComplianceRequirementRecord,
  RequirementWithStatus,
} from './types';

export function evaluateRequirements(
  requirements: readonly ComplianceRequirementRecord[],
  documents: readonly ComplianceDocumentRecord[],
  today: string,
): RequirementWithStatus[] {
  const byRequirement = new Map<string, ComplianceDocumentRecord[]>();
  for (const document of documents) {
    const list = byRequirement.get(document.requirementId) ?? [];
    list.push(document);
    byRequirement.set(document.requirementId, list);
  }
  return requirements.map((requirement) => {
    const docs = (byRequirement.get(requirement.id) ?? []).sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    );
    return { ...requirement, documents: docs, evaluation: computeRequirementStatus(requirement, docs, today) };
  });
}

export interface AgreementHeader {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly vendorId: string;
  readonly vendorName: string;
}

export function buildAgreementViews(
  agreements: readonly AgreementHeader[],
  requirements: readonly RequirementWithStatus[],
): AgreementComplianceView[] {
  const byAgreement = new Map<string, RequirementWithStatus[]>();
  for (const requirement of requirements) {
    const list = byAgreement.get(requirement.subcontractAgreementId) ?? [];
    list.push(requirement);
    byAgreement.set(requirement.subcontractAgreementId, list);
  }
  return agreements.map((agreement) => {
    const rows = byAgreement.get(agreement.id) ?? [];
    return {
      agreementId: agreement.id,
      agreementTitle: agreement.title,
      agreementStatus: agreement.status,
      vendorId: agreement.vendorId,
      vendorName: agreement.vendorName,
      requirements: rows,
      counts: countStatuses(rows.map((row) => row.evaluation.status)),
      pendingReviewCount: rows.filter((row) => row.evaluation.pendingReview).length,
      blockingCount: rows.filter((row) =>
        isRequirementBlocking({ isRequired: row.isRequired, blocksPayment: row.blocksPayment, status: row.evaluation.status }),
      ).length,
    };
  });
}
