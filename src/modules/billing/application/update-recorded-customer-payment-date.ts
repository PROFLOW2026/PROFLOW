import type { OrgContext } from '@/shared/auth/context';
import { correctRecordedCustomerPayment } from './correct-recorded-customer-payment';
import type { UpdateRecordedCustomerPaymentDateInput } from '../validation/schemas';

export async function updateRecordedCustomerPaymentDate(
  context: OrgContext,
  rawInput: UpdateRecordedCustomerPaymentDateInput,
) {
  return correctRecordedCustomerPayment(context, {
    paymentId: rawInput.paymentId,
    paymentDate: rawInput.paymentDate,
    changeAcknowledged: true,
  });
}
