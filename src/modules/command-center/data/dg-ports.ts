import type { OrgContext } from '@/shared/auth/context';
import type { BusinessDate } from '@/shared/dates';
import type { DgCommandCenterRow } from '../domain/dg-items';
import type { DgSourceType } from '../domain/types';

/**
 * Ports the domain tracks implement for Command Center. A port receives ONLY the projects on
 * which the viewer holds the required capability and must return actionable rows for those
 * projects (scoped, indexed, `limit` respected, no money). It runs on `context.db` (RLS-bound).
 */
export interface DgCommandCenterQueryInput {
  readonly projectIds: readonly string[];
  readonly today: BusinessDate;
  readonly limit: number;
}

export type DgCommandCenterQuery = (
  context: OrgContext,
  input: DgCommandCenterQueryInput,
) => Promise<readonly DgCommandCenterRow[]>;

/**
 * Expected providers (owner track -> export):
 *  dg_claim_awaiting_review        F  `@/modules/subcontract-claims`   claims submitted / under review
 *  dg_coordination_blocked         H  `@/modules/coordination`         upcoming events with BLOCKED / NOT_READY required parties
 *  dg_acknowledgement_overdue      O, IJ, H                            instructions / plan revisions / invitations past their ack deadline
 *  dg_critical_task_overdue        G  `@/modules/collaboration`        critical/urgent contractor tasks past due, not closed
 *  dg_defect_awaiting_verification MN `@/modules/defects`              defects in completion_submitted
 *  dg_rfi_overdue                  KL `@/modules/rfi`                  open RFIs past due date
 *  dg_compliance_expiring          P  `@/modules/contractor-compliance` required items expiring / expired
 *  dg_submittal_pending            KL `@/modules/submittals`           submittals awaiting review
 *  dg_payment_eligibility_blocked  F  `@/modules/subcontract-claims`   certified claims with active payment holds
 * Several tracks may provide the same source (acknowledgements): rows are merged.
 */
const providers = new Map<DgSourceType, DgCommandCenterQuery[]>();

export function registerDgCommandCenterPort(sourceType: DgSourceType, query: DgCommandCenterQuery): void {
  const list = providers.get(sourceType) ?? [];
  if (!list.includes(query)) list.push(query);
  providers.set(sourceType, list);
}

export function dgCommandCenterPortsFor(sourceType: DgSourceType): readonly DgCommandCenterQuery[] {
  return providers.get(sourceType) ?? [];
}

/** Test helper: removes every registered provider. */
export function clearDgCommandCenterPorts(): void {
  providers.clear();
}
