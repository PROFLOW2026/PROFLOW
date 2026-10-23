import type { BusinessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import type { BillingAmountInput, PaymentAmountInput } from '@/modules/billing/domain/outstanding';
import type { ProjectBillingRows } from '@/modules/financials/data/billing.repository';

export type ProjectBillingRecord = ProjectBillingRows['records'][number];

/**
 * Calculation fields the test must set. Display fields used by the receivable
 * detail (project, reference, customer) default here, so a new required
 * display column fails in this helper rather than in every billing fixture.
 */
export type ProjectBillingRecordInput = BillingAmountInput & {
  readonly id: string;
  readonly dueDate: BusinessDate | null;
  readonly payments: readonly PaymentAmountInput[];
  readonly retentionHeldRemaining?: MoneyValue;
  readonly subtotalAmount: MoneyValue;
} & Partial<Pick<ProjectBillingRecord, 'projectId' | 'reference' | 'customerName'>>;

export function projectBillingRecord(record: ProjectBillingRecordInput): ProjectBillingRecord {
  return {
    projectId: null,
    reference: null,
    customerName: null,
    ...record,
  };
}
