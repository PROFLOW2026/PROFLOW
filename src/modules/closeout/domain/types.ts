/**
 * Project closeout overlay. Closed = existing project.status `completed`.
 * Ready-to-close is closeout.status `ready` while the project may stay `active`.
 */

export const CLOSEOUT_STATUSES = ['open', 'ready', 'closed', 'reopened'] as const;
export type CloseoutStatus = (typeof CLOSEOUT_STATUSES)[number];

export const CLOSEOUT_EVENT_KINDS = ['started', 'marked_ready', 'closed', 'reopened'] as const;
export type CloseoutEventKind = (typeof CLOSEOUT_EVENT_KINDS)[number];

export const READINESS_SEVERITIES = ['hard', 'warning', 'info'] as const;
export type ReadinessSeverity = (typeof READINESS_SEVERITIES)[number];

export const READINESS_ITEM_KEYS = [
  'openDefects',
  'openInspections',
  'incompleteForms',
  'openSafety',
  'unresolvedChanges',
  'unapprovedTime',
  'openCommitments',
  'openPurchaseOrders',
  'openSupplierLiabilities',
  'openClientBalances',
  'unbilledWork',
  'remainingRetention',
  'openSubcontract',
  'missingDocuments',
  'unfinishedMilestones',
] as const;
export type ReadinessItemKey = (typeof READINESS_ITEM_KEYS)[number];

export interface CloseoutRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly status: CloseoutStatus;
  readonly financialSnapshotJson: unknown;
  readonly closeReason: string | null;
  readonly reopenReason: string | null;
  readonly closedAt: Date | null;
  readonly closedByUserId: string | null;
  readonly reopenedAt: Date | null;
  readonly reopenedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CloseoutEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly closeoutId: string;
  readonly projectId: string;
  readonly eventKind: CloseoutEventKind;
  readonly reason: string | null;
  readonly snapshotJson: unknown;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface ReadinessItem {
  readonly key: ReadinessItemKey;
  readonly severity: ReadinessSeverity;
  readonly count: number;
}

export interface ReadinessFacts {
  readonly openDefects: number;
  readonly failedInspections: number;
  readonly openInspections: number;
  readonly incompleteForms: number;
  readonly openSafety: number;
  readonly awaitingApprovalChanges: number;
  readonly draftChanges: number;
  readonly submittedUnapprovedTime: number;
  readonly otherUnapprovedTime: number;
  readonly openCommitments: number;
  readonly openPurchaseOrders: number;
  readonly openSupplierLiabilities: number;
  readonly openClientBalances: number;
  readonly unbilledWork: number;
  readonly remainingRetention: number;
  readonly openSubcontract: number;
  readonly missingDocuments: number;
  readonly unfinishedMilestones: number;
}

export interface SerializedMoney {
  readonly amount: string;
  readonly currency: string;
}

/** Immutable JSON stored on close + events. Profit omitted without permission. */
export interface CloseoutFinancialSnapshot {
  readonly currency: string;
  readonly capturedAt: string;
  readonly originalContract: SerializedMoney | null;
  readonly currentContract: SerializedMoney | null;
  readonly approvedChanges: SerializedMoney | null;
  readonly actualCost: SerializedMoney;
  readonly remainingCommitments: SerializedMoney;
  readonly totalBilling: SerializedMoney;
  readonly paymentsReceived: SerializedMoney;
  readonly outstandingClient: SerializedMoney;
  readonly supplierOutstanding: SerializedMoney;
  readonly retentionHeld: SerializedMoney | null;
  readonly expectedProfit: SerializedMoney | null;
  readonly marginPercent: string | null;
  readonly profitHidden: boolean;
}
