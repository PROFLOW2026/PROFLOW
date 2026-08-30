import { businessDate } from '@/shared/dates';
import { fromNumericString } from '@/shared/money';
import type { BillingKind, BillingRecordStatus } from '@/modules/billing/domain/types';
import type { PaymentAmountInput } from '@/modules/billing/domain/outstanding';
import type { ProjectBillingRows } from '../data/billing.repository';
import type { FinancialsBillingBundle } from '../data/financials-read-bundle.repository';

export function foldBillingRowsFromBundle(bundle: FinancialsBillingBundle): ProjectBillingRows {
  if (bundle.records.length === 0) {
    return { records: [], currency: '' };
  }

  const currency = bundle.records[0]!.currency;
  const paymentsByRecord = new Map<string, PaymentAmountInput[]>();

  for (const payment of bundle.payments) {
    const amount = fromNumericString(payment.amount, payment.currency);
    if (!amount) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push({ amount, status: payment.status as PaymentAmountInput['status'] });
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  const records = bundle.records.map((record) => ({
    id: record.id,
    dueDate: record.dueDate ? businessDate(record.dueDate) : null,
    kind: record.kind as BillingKind,
    status: record.status as BillingRecordStatus,
    totalAmount: fromNumericString(record.totalAmount, record.currency)!,
    subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
    payments: paymentsByRecord.get(record.id) ?? [],
    retentionHeldRemaining:
      fromNumericString(record.retentionHeldRemaining ?? '0', record.currency) ?? undefined,
  }));

  return { records, currency };
}
