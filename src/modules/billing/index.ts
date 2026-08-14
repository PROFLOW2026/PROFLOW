/** Public API of the billing module (doc 76 §3). */
export { createBillingRecord } from './application/create-billing-record';
export { createBillingRecordWithPermission } from './application/create-billing-record';
export { updateBillingRecord } from './application/update-billing-record';
export {
  finalizeBillingRecord,
  finalizeBillingRecordWithPermission,
} from './application/finalize-billing-record';
export { voidBillingRecord } from './application/void-billing-record';
export { createBillingAdjustment } from './application/create-billing-adjustment';
export { listBillingRecords } from './application/list-billing-records';
export { getBillingRecord } from './application/get-billing-record';
export { recordPayment } from './application/record-payment';
export { voidPayment } from './application/void-payment';
export { getProjectBillingPosition } from './application/get-project-billing-position';
export {
  listUnbilledChangeOrders,
  listProjectBillingRecords,
  listBillingProjectOptions,
} from './application/project-billing';

export { getOrganizationReceivablesAging } from './application/get-receivables-aging';
export { getOrganizationReceivablesSummary } from './application/get-receivables-summary';
export { listPaymentApplications } from './application/list-payment-applications';
export { computeReceivablesAging } from './domain/aging';
export { computeReceivablesSummary } from './domain/receivables-summary';
export type { AgingBucket, AgingBucketKey, ReceivablesAging } from './domain/aging';
export type { ReceivablesSummary } from './domain/receivables-summary';

export {
  aggregateBillingPosition,
  aggregateBillingPositionInCurrency,
  computeOutstanding,
  deriveCollectionStatus,
  matchesListFilter,
  recordOutstanding,
  signedBillingAmount,
  sumInvoicedAmounts,
  sumPaidAmounts,
  sumPaidAmountsForRecord,
} from './domain/outstanding';
export { recordStatusShape } from './domain/lifecycle';

export type {
  BillingRecordDetail,
  BillingRecordSummary,
  BillingListFilter,
  BillingListFilters,
  BillingRecordStatus,
  BillingKind,
  CollectionStatus,
  PaymentSummary,
  PaymentApplicationRow,
  PaymentApplicationFilters,
  UnbilledChangeOrder,
  ProjectOption,
} from './domain/types';

export {
  createBillingRecordSchema,
  updateBillingRecordSchema,
  createPaymentSchema,
  listBillingRecordsSchema,
  listPaymentApplicationsSchema,
  createAdjustmentSchema,
  billingRecordIdSchema,
  paymentIdSchema,
} from './validation/schemas';
export type {
  CreateBillingRecordInput,
  UpdateBillingRecordInput,
  CreatePaymentInput,
  ListBillingRecordsInput,
  ListPaymentApplicationsInput,
  CreateAdjustmentInput,
} from './validation/schemas';

/** Cross-module billing amount rows for safe portal outstanding (not payment write). */
export { listProjectBillingAmountRows } from './data/billing.repository';
