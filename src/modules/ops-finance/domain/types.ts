/**
 * Ops → Finance bridge types.
 * Operational records alone never enter Actual; only finalized linked expenses do.
 */

export const OPS_RECORD_KINDS = [
  'maintenance_record',
  'compliance_artifact',
  'fleet_vehicle',
  'recurring_business_cost',
] as const;
export type OpsRecordKind = (typeof OPS_RECORD_KINDS)[number];

/** Inventory movements are never an ops→finance link source. */
export const FORBIDDEN_OPS_LINK_KINDS = ['inventory_movement'] as const;
export type ForbiddenOpsLinkKind = (typeof FORBIDDEN_OPS_LINK_KINDS)[number];

export const OPS_LINK_PURPOSES = ['expense_draft', 'overhead_allocation'] as const;
export type OpsLinkPurpose = (typeof OPS_LINK_PURPOSES)[number];

export interface OpsExpenseLink {
  readonly id: string;
  readonly organizationId: string;
  readonly opsRecordKind: OpsRecordKind;
  readonly opsRecordId: string;
  readonly expenseId: string;
  readonly linkPurpose: OpsLinkPurpose;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
}

export interface OpsRecordCostSnapshot {
  readonly opsRecordKind: OpsRecordKind;
  readonly opsRecordId: string;
  /** Operational metadata amount - not Actual until a linked expense is finalized. */
  readonly costAmount: string | null;
  readonly currency: string | null;
  readonly title: string;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly occurredOn: string | null;
  readonly notes: string | null;
}
