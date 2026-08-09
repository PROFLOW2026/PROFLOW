/** Public API of the AP / PO matching module (Wave 3). AP bill != Expense. */
export {
  listApBillsForOrg,
  getApBillDetail,
  createApBill,
} from './application/bills';

export {
  proposeApMatch,
  acceptApMatch,
  rejectApMatch,
} from './application/matches';

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
  createApBillSchema,
  proposeApMatchSchema,
  decideApMatchSchema,
} from './validation/schemas';
export type {
  CreateApBillInput,
  ProposeApMatchInput,
  DecideApMatchInput,
} from './validation/schemas';

/** Cross-module AP rollups (cash flow / committed payable). AP bill ≠ Expense. */
export {
  listApBills,
  listAcceptedMatchAmountsForBills,
} from './data/ap.repository';
