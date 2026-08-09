/** Public API of the billing module (doc 76 §3). */
export { createBillingRecord } from './application/create-billing-record';
export { updateBillingRecord } from './application/update-billing-record';
export { finalizeBillingRecord } from './application/finalize-billing-record';
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

export {
  aggregateBillingPosition,
  aggregateBillingPositionInCurrency,
  computeOutstanding,
  deriveCollectionStatus,
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
  UnbilledChangeOrder,
  ProjectOption,
} from './domain/types';

export {
  createBillingRecordSchema,
  updateBillingRecordSchema,
  createPaymentSchema,
  listBillingRecordsSchema,
  createAdjustmentSchema,
  billingRecordIdSchema,
  paymentIdSchema,
} from './validation/schemas';
export type {
  CreateBillingRecordInput,
  UpdateBillingRecordInput,
  CreatePaymentInput,
  ListBillingRecordsInput,
  CreateAdjustmentInput,
} from './validation/schemas';
