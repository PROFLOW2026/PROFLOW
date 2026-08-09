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
  isAcceptingMatchCreatingExpense,
  deriveBillStatusFromAcceptedMatches,
} from './domain/matching';
export type { ApBillStatus, ApMatchStatus } from './domain/matching';

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
