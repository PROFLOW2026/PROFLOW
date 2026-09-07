import type { OrgFinancialPolicies } from '@/modules/tenancy/domain/org-financial-policies';
import type { VendorRecord } from '@/modules/vendors/domain/types';

export const VENDOR_PAYMENT_CONFIRMATION_OVERRIDES = ['org_default', 'automatic'] as const;

export const PAYMENT_DUE_SOON_DAYS = 7;

export type ExpenseAutomaticPaymentKind =
  | 'none'
  | 'org_automatic_on_due'
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

/**
 * Auto payment confirmation is opt-in at org level only.
 * Vendor/template overrides affect due-date scheduling, not auto-approval.
 */
export function resolveExpenseAutomaticPaymentKind(
  input: ExpensePaymentBehaviorInput,
): ExpenseAutomaticPaymentKind {
  if (input.policies.expensePaymentConfirmationMode !== 'automatic_on_due') {
    return 'none';
  }

  if (input.installmentCount > 1) {
    return 'installment_automatic';
  }

  return 'org_automatic_on_due';
}

/** Automatic policies never surface Owner confirmation alerts. */
export function expenseRequiresOwnerPaymentConfirmation(
  kind: ExpenseAutomaticPaymentKind,
  manualOrgPolicy: boolean,
): boolean {
  if (kind !== 'none') return false;
  return manualOrgPolicy;
}
