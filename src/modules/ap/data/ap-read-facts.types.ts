/** Raw AP rows loaded in one SQL round trip for Financials / GCM reuse. */

export type ApBillFactRow = {
  readonly id: string;
  readonly projectId: string | null;
  readonly status: string;
  readonly totalAmount: string;
  readonly netAmount: string | null;
  readonly currency: string;
  readonly retentionHeldRemaining: string;
  readonly billDate: string | null;
};

export type ApAllocationFactRow = {
  readonly apBillId: string;
  readonly projectId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly targetType: string;
  readonly status: string;
};

export type ApCreditFactRow = {
  readonly apBillId: string;
  readonly appliedGross: string;
  readonly currency: string;
  readonly creditNet: string | null;
  readonly creditGross: string | null;
  readonly creditProjectId: string | null;
};

export type ApPaymentFactRow = {
  readonly apBillId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentStatus: string;
};

export type ApPoMatchFactRow = {
  readonly apBillId: string;
  readonly expenseId: string;
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
};

export type ApOrgReadFactsBundle = {
  readonly bills: readonly ApBillFactRow[];
  readonly allocations: readonly ApAllocationFactRow[];
  readonly creditReductions: readonly ApCreditFactRow[];
  readonly vendorPayments: readonly ApPaymentFactRow[];
  readonly poMatches: readonly ApPoMatchFactRow[];
};
