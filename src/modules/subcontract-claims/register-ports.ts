import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryClaimsAwaitingReview, queryPaymentEligibilityBlocked } from './application/command-center';

registerDgCommandCenterPort('dg_claim_awaiting_review', queryClaimsAwaitingReview);
registerDgCommandCenterPort('dg_payment_eligibility_blocked', queryPaymentEligibilityBlocked);
