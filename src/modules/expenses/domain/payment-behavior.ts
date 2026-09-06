import type { OrgFinancialPolicies } from '@/modules/tenancy/domain/org-financial-policies';
import type { VendorRecord } from '@/modules/vendors/domain/types';

export const VENDOR_PAYMENT_CONFIRMATION_OVERRIDES = ['org_default', 'automatic'] as const;

export const PAYMENT_DUE_SOON_DAYS = 7;

export type ExpenseAutomaticPaymentKind =
  | 'none'
  | 'org_automatic_on_due'
  | 'vendor_recurring_automatic'
  | 'template_recurring_automatic'
  | 'installment_automatic';

export interface RecurringTemplatePaymentBehavior {
  readonly paymentConfirmationOverride: 'org_default' | 'automatic';
}

export interface ExpensePaymentBehaviorInput {
  readonly automaticInstallmentPayment: boolean;
  readonly installmentCount: number;
  readonly vendor: Pick<VendorRecord, 'paymentConfirmationOverride'> | null;
  readonly recurringDraft?: (RecurringTemplatePaymentBehavior & { readonly draftKind?: string }) | null;
  readonly policies: OrgFinancialPolicies;
}

export function resolveExpenseAutomaticPaymentKind(
  input: ExpensePaymentBehaviorInput,
): ExpenseAutomaticPaymentKind {
  // Installment schedules pre-authorize each due payment — no monthly Owner confirm.
  if (input.installmentCount > 1) {
    return 'installment_automatic';
  }
  // Recurring expense templates with a schedule are pre-authorized operational payments.
  if (input.recurringDraft?.draftKind === 'expense') {
    return 'template_recurring_automatic';
  }
  if (input.recurringDraft?.paymentConfirmationOverride === 'automatic') {
    return 'template_recurring_automatic';
  }
  if (input.vendor?.paymentConfirmationOverride === 'automatic') {
    return 'vendor_recurring_automatic';
  }
  if (input.policies.expensePaymentConfirmationMode === 'automatic_on_due') {
    return 'org_automatic_on_due';
  }
  return 'none';
}

/** Automatic policies never surface Owner confirmation alerts. */
export function expenseRequiresOwnerPaymentConfirmation(
  kind: ExpenseAutomaticPaymentKind,
  manualOrgPolicy: boolean,
): boolean {
  if (kind !== 'none') return false;
  return manualOrgPolicy;
}
