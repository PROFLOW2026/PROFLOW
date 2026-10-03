/** Critical material / equipment delivery tracking (Track P). Framework-free; no money. */

export const DELIVERY_ITEM_KINDS = ['material', 'equipment'] as const;
export type DeliveryItemKind = (typeof DELIVERY_ITEM_KINDS)[number];

export const DELIVERY_STATES = [
  'planned',
  'ordered',
  'in_transit',
  'partially_delivered',
  'delivered',
  'rejected',
  'cancelled',
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const OPEN_DELIVERY_STATES: readonly DeliveryState[] = ['planned', 'ordered', 'in_transit', 'partially_delivered'];

/** States a contractor may report from the portal (acceptance / rejection / cancellation stay internal). */
export const CONTRACTOR_REPORTABLE_STATES: readonly DeliveryState[] = [
  'ordered',
  'in_transit',
  'partially_delivered',
  'delivered',
];

export const DELIVERY_REPORT_KINDS = ['status_update', 'delay_notice', 'arrived', 'issue', 'note'] as const;
export type DeliveryReportKind = (typeof DELIVERY_REPORT_KINDS)[number];

export const DELIVERY_ITEM_ENTITY = 'delivery_item' as const;

export type DeliveryActorType = 'internal' | 'external' | 'system';

export interface DeliveryItemRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly itemName: string;
  readonly description: string | null;
  readonly itemKind: DeliveryItemKind;
  readonly isCritical: boolean;
  readonly supplierVendorId: string | null;
  readonly supplierName: string | null;
  readonly quantity: string | null;
  readonly unit: string | null;
  readonly orderDate: string | null;
  readonly originalExpectedDate: string | null;
  readonly expectedDate: string | null;
  readonly actualDate: string | null;
  readonly state: DeliveryState;
  readonly locationId: string | null;
  readonly workPackageId: string | null;
  readonly purchaseOrderId: string | null;
  readonly notes: string | null;
  readonly contractorVisible: boolean;
  readonly delayNotifiedFor: string | null;
  readonly createdActorType: DeliveryActorType;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DeliveryReportRecord {
  readonly id: string;
  readonly deliveryItemId: string;
  readonly reportKind: DeliveryReportKind;
  readonly reportedState: DeliveryState | null;
  readonly newExpectedDate: string | null;
  readonly actualDate: string | null;
  readonly note: string | null;
  readonly actorType: DeliveryActorType;
  readonly actorUserId: string | null;
  readonly actorPrincipalId: string | null;
  readonly createdAt: Date;
}

export interface DeliveryWithStatus extends DeliveryItemRecord {
  readonly delayed: boolean;
  /** Days late (open: today - expected; delivered: actual - expected). 0 when on time / unknown. */
  readonly delayDays: number;
  /** Days the expected date moved from the original promise (positive = later). */
  readonly slippageDays: number;
}
