export {
  assertCanReadBillProjectAllocations,
  assertCanManageBillProjectAllocations,
  applyBillProjectAllocations,
  loadBillProjectAllocationReview,
  saveBillProjectAllocations,
} from './application/bill-project-allocations';
export type { BillProjectAllocationReview } from './application/bill-project-allocations';

/** Public API of the AP / PO matching module (Wave 3). AP bill != Expense. */
export {
  listApBillsForOrg,
  getApBillDetail,
  createApBill,
  createDraftApBill,
  postApBill,
  updateDraftApBillRetention,
} from './application/bills';
export { editRecognizedApBill } from './application/edit-recognized-ap-bill';

export { voidApBill, rejectSilentRecognizedBillEdit } from './application/void-bill';
export { restoreApBill } from './application/restore-ap-bill';

export {
  proposeApMatch,
  acceptApMatch,
  rejectApMatch,
} from './application/matches';

export {
  getBillPayablePosition,
  listVendorPaymentsForBill,
  listVendorPaymentsForVendor,
  recordVendorPayment,
  voidVendorPayment,
  updateVendorPaymentMetadata,
  deleteVendorPayment,
  rejectPaymentApplicationMutation,
} from './application/payments';

export {
  createVendorCredit,
  postVendorCredit,
  updateVendorCredit,
  applyVendorCredit,
  voidVendorCredit,
  listVendorCredits,
  listCreditsForBill,
  getVendorCredit,
  getVendorCreditDetail,
} from './application/credits';
export type { ApVendorCreditListView } from './application/credits';

export {
  getOrganizationApPayables,
  getVendorApOutstanding,
  getProjectApOutstanding,
  getOrganizationPayablesAging,
  getVendorPayablesAging,
} from './application/payables';
export type { BillPayableSummary, OrgApPayablesSummary } from './application/payables';

export {
  AP_BILL_STATUSES,
  AP_MATCH_STATUSES,
  assertMatchHasTarget,
  assertAcceptMatchDoesNotCreateExpense,
  assertMatchDoesNotOverMatch,
  assertMatchCurrencyIntegrity,
  isAcceptingMatchCreatingExpense,
  deriveBillStatusFromAcceptedMatches,
  remainingUnmatchedAmount,
  computeMatchVariance,
  sumMatchAmounts,
} from './domain/matching';
export type { ApBillStatus, ApMatchStatus, MatchVariance } from './domain/matching';

export {
  RECOGNIZED_VENDOR_BILL_STATUSES,
  isRecognizedVendorBillStatus,
  isVendorBillExcludedFromActual,
  composeVendorCostRecognition,
  composeVendorForecastExposure,
  consumeAmountForPostedPoBill,
  shouldConsumeCommitmentOnMatchAccept,
  shouldReleaseRemainingCommitmentOnSettlement,
  isVendorPaymentRecognizedActual,
  netActualAfterVendorRecognition,
} from './domain/vendor-cost-recognition';
export type {
  RecognizedVendorBillStatus,
  VendorCostRecognitionInput,
  VendorCostRecognitionResult,
} from './domain/vendor-cost-recognition';

export {
  resolveApBillTaxSplit,
  vendorBillActualAmount,
  vendorBillPayableAmount,
} from './domain/bill-tax';
export type { ApBillTaxSplit, ApTaxBasis } from './domain/bill-tax';

export {
  assertApBillVoidable,
  assertRecognizedBillNotSilentlyEditable,
  assertVoidRemovesFromActual,
} from './domain/bill-lifecycle';

export {
  AP_CREDIT_STATUSES,
  AP_CREDIT_APPLICATION_STATUSES,
  AP_CREDIT_LIFECYCLE_DISPLAY_STATUSES,
  AP_CREDITS_PERSISTENCE_READY,
  areApCreditsAvailable,
  setApCreditsPersistenceReadyForTests,
  assertCreditIsNotPayment,
  assertCreditCreatable,
  assertCreditApplicable,
  assertCreditDraftEditable,
  assertCreditVoidable,
  assertCreditNotSilentlyEditable,
  displayCreditLifecycleStatus,
  netRecognizedBillAfterCredits,
  scaleBillSliceAfterCredits,
  netProjectSliceAfterCredits,
  creditApplicationActualReduction,
  creditRemaining,
  deriveCreditStatusAfterApplication,
  sumActiveCreditAmounts,
} from './domain/vendor-credits';
export type {
  ApCreditStatus,
  ApCreditApplicationStatus,
  ApCreditLifecycleDisplayStatus,
} from './domain/vendor-credits';

export {
  AP_BILL_PROJECT_ALLOCATIONS_READY,
  areApBillProjectAllocationsAvailable,
  setApBillProjectAllocationsReadyForTests,
  resolveVendorBillProjectAmounts,
  scaleBillOutstandingToProjectSlice,
} from './domain/vendor-bill-project-attribution';
export type {
  VendorBillHeaderSlice,
  VendorBillAllocationSlice,
} from './domain/vendor-bill-project-attribution';

export {
  classifyVendorBillGeneralRemainder,
  vendorBillGeneralRemainderAmount,
  splitVendorBillGeneralRemainder,
  sumVendorBillGeneralRemainders,
  billNetForGeneralRemainder,
} from './domain/vendor-general-remainder';
export type {
  VendorBillGeneralRemainderKind,
  VendorBillGeneralRemainderBuckets,
  VendorBillGeneralRemainderInput,
} from './domain/vendor-general-remainder';

export {
  AP_PAYMENT_STATUSES,
  AP_PAYABLE_STATUSES,
  AP_PAYMENTS_PERSISTENCE_READY,
  areApPaymentsAvailable,
  setApPaymentsPersistenceReadyForTests,
  assertVendorPaymentDoesNotAffectActual,
  assertPaymentApplicationsValid,
  assertPaymentVoidable,
  assertPaymentNotDeletable,
  assertPaymentApplicationNotMutable,
  assertPaymentFinancialFieldsImmutable,
  assertPaymentMetadataEditable,
  assertApPaymentCurrencyMatch,
  computeBillRemainingOutstanding,
  computePaymentRemaining,
  sumActivePaymentAmounts,
  sumActiveAppliedAmounts,
  isBillPayable,
  computeBillOutstanding,
  derivePayableStatus,
  applySequentialBillPayments,
  aggregateVendorOutstanding,
} from './domain/vendor-payments';
export type {
  ApPaymentStatus,
  ApPayableStatus,
  VendorPaymentAmountInput,
  VendorPaymentApplicationInput,
  BillPayableInput,
  BillCreditApplicationInput,
} from './domain/vendor-payments';

export { computePayablesAging } from './domain/payables-aging';
export type {
  ApAgingBucketKey,
  ApAgingBucket,
  PayablesAging,
  ApAgingBillInput,
} from './domain/payables-aging';

export {
  createApBillSchema,
  proposeApMatchSchema,
  decideApMatchSchema,
  recordVendorPaymentSchema,
  voidVendorPaymentSchema,
  updateVendorPaymentMetadataSchema,
  saveBillProjectAllocationsSchema,
  applyBillProjectAllocationsSchema,
  voidApBillSchema,
  createVendorCreditSchema,
  applyVendorCreditSchema,
  updateVendorCreditDraftSchema,
  voidVendorCreditSchema,
} from './validation/schemas';
export type {
  CreateApBillInput,
  ProposeApMatchInput,
  DecideApMatchInput,
  RecordVendorPaymentInput,
  VoidVendorPaymentInput,
  UpdateVendorPaymentMetadataInput,
  SaveBillProjectAllocationsInput,
  ApplyBillProjectAllocationsInput,
  VoidApBillInput,
  CreateVendorCreditInput,
  ApplyVendorCreditInput,
  UpdateVendorCreditDraftInput,
  VoidVendorCreditInput,
} from './validation/schemas';

export {
  BILL_ALLOCATION_METHODS,
  previewBillAllocationStrip,
  resolveBillAllocationLineAmount,
  resolveBillProjectAllocationLines,
} from './domain/bill-project-allocation';
export type {
  BillAllocationLineDraft,
  BillAllocationMethod,
  BillAllocationPreview,
  ResolvedBillAllocationLine,
} from './domain/bill-project-allocation';

/** Cross-module AP rollups (cash flow / committed payable). AP bill ≠ Expense. */
export {
  listApBills,
  listAcceptedMatchAmountsForBills,
  insertApBill,
  insertApBillLines,
  assertVendorInOrganization,
  findApBillById,
} from './data/ap.repository';

export {
  listActiveCreditAmountsForBill,
  listActiveCreditAmountsForBills,
  listActiveCreditActualReductionsForBills,
  creditActualReductionAmounts,
  creditActualReductionsForProject,
  type CreditActualReduction,
} from './data/credits.repository';

export { sumRecognizedApGeneralRemainders } from './data/vendor-general-remainder.repository';
export type { ApGeneralRemainderTotals } from './data/vendor-general-remainder.repository';

export {
  getVendorPaymentsRepository,
  setVendorPaymentsRepository,
  resetVendorPaymentsRepository,
  enableApPaymentsPersistenceForTests,
  disableApPaymentsPersistenceForTests,
  createInMemoryVendorPaymentsRepository,
  gatedVendorPaymentsRepository,
  drizzleVendorPaymentsRepository,
} from './data/payments.repository';
export type {
  ApPaymentRow,
  ApPaymentApplicationRow,
  ApPaymentWithApplications,
  VendorPaymentsRepository,
} from './data/payments.repository';
