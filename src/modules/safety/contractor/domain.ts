import { DomainRuleError } from '@/shared/errors';
import { isOpenSafetyActionStatus, isOpenSafetyRecordStatus } from '../domain/status';
import type {
  SafetyActionStatus,
  SafetyCorrectiveActionRecord,
  SafetyRecordStatus,
  SafetySeverity,
} from '../domain/types';

/**
 * Contractor site-safety layer on top of the existing safety module (Track P). Framework-free.
 * Records stay in `safety_records`; the contractor linkage lives in `safety_record_contractor_links`.
 */

/** Record kinds contractors and site staff report about a contractor (toolbox talks stay internal). */
export const CONTRACTOR_SAFETY_RECORD_TYPES = ['observation', 'hazard', 'near_miss', 'incident', 'accident', 'ppe_issue'] as const;
export type ContractorSafetyRecordType = (typeof CONTRACTOR_SAFETY_RECORD_TYPES)[number];

export const SAFETY_RECORD_ENTITY = 'safety_record' as const;

export interface ContractorSafetyRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly locationId: string | null;
  readonly recordType: ContractorSafetyRecordType;
  readonly severity: SafetySeverity;
  readonly title: string;
  readonly description: string;
  readonly immediateAction: string | null;
  readonly occurredAt: Date;
  readonly status: SafetyRecordStatus;
  readonly dueDate: string | null;
  readonly contractorVisible: boolean;
  readonly reportedActorType: 'internal' | 'external' | 'system';
  readonly reportedByUserId: string | null;
  readonly reportedByPrincipalId: string | null;
  readonly closedAt: Date | null;
  readonly closureVerifiedAt: Date | null;
  readonly closureVerificationNote: string | null;
  readonly createdAt: Date;
}

export interface ContractorSafetyAction extends SafetyCorrectiveActionRecord {
  readonly taskId: string | null;
}

export interface ContractorSafetyDetail extends ContractorSafetyRecord {
  readonly actions: readonly ContractorSafetyAction[];
}

export function isContractorSafetyOverdue(
  record: { readonly status: SafetyRecordStatus; readonly dueDate: string | null },
  today: string,
): boolean {
  return isOpenSafetyRecordStatus(record.status) && record.dueDate !== null && record.dueDate < today;
}

/**
 * Closure verification: a contractor safety record closes only when every corrective action is
 * done/cancelled and the verifier writes what was checked on site.
 */
export function assertCanCloseContractorSafety(input: {
  readonly status: SafetyRecordStatus;
  readonly actionStatuses: readonly SafetyActionStatus[];
  readonly verificationNote: string | null | undefined;
}): void {
  if (!isOpenSafetyRecordStatus(input.status)) {
    throw new DomainRuleError('Safety record is not open', 'contractorCompliance.safety.errors.notOpen');
  }
  if (input.actionStatuses.some(isOpenSafetyActionStatus)) {
    throw new DomainRuleError(
      'Open corrective actions block closure',
      'contractorCompliance.safety.errors.openActions',
    );
  }
  if (!(input.verificationNote ?? '').trim()) {
    throw new DomainRuleError(
      'Closure verification note is required',
      'contractorCompliance.safety.errors.verificationRequired',
    );
  }
}

/** Follow-up task priority from the record severity. */
export function taskPriorityForSeverity(severity: SafetySeverity): 'low' | 'medium' | 'high' | 'urgent' {
  switch (severity) {
    case 'critical':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

/** Pick the vendor an external principal reports for on a project (explicit choice when ambiguous). */
export function resolveReportingVendor(
  candidateVendorIds: readonly string[],
  requested: string | null | undefined,
): string | null {
  if (requested) return candidateVendorIds.includes(requested) ? requested : null;
  return candidateVendorIds.length === 1 ? candidateVendorIds[0]! : null;
}
