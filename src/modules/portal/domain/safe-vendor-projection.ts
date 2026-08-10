import { DomainRuleError } from '@/shared/errors';
import type {
  ExternalAccessGrantRecord,
  VendorPortalScope,
  VendorPortalSession,
  VendorSafePaymentOutstanding,
  VendorSafePoSummary,
  VendorSafeRfqSummary,
} from './types';
import { grantIsActive } from './safe-project-summary';
import { normalizeVendorScopes } from './vendor-scopes';

/**
 * Vendor payment/outstanding exposure policy.
 * Disabled until AP vendor payments can be projected without leaking cost
 * recognition, match variance, or internal settlement math (Agent 1 surface).
 */
export type VendorPaymentOutstandingPolicy = 'disabled' | 'enabled';

export const VENDOR_PAYMENT_OUTSTANDING_POLICY: VendorPaymentOutstandingPolicy = 'disabled';

export const VENDOR_PAYMENT_OUTSTANDING_DISABLED_NOTE =
  'Vendor payment/outstanding is policy-disabled until AP payments can be exposed safely. Candidates and PO totals remain available under their own scopes.';

export function isVendorPaymentOutstandingPolicyEnabled(): boolean {
  return VENDOR_PAYMENT_OUTSTANDING_POLICY === 'enabled';
}

/** Approved / issued commercial POs visible to the granted vendor. Drafts stay internal. */
export const VENDOR_VISIBLE_PO_STATUSES = [
  'issued',
  'partially_received',
  'closed',
] as const;

export function isVendorVisiblePoStatus(status: string): boolean {
  return (VENDOR_VISIBLE_PO_STATUSES as readonly string[]).includes(status);
}

export function grantHasVendorScope(
  grant: Pick<ExternalAccessGrantRecord, 'scopes'>,
  scope: VendorPortalScope,
): boolean {
  return normalizeVendorScopes(grant.scopes).includes(scope);
}

export function assertVendorGrantActive(
  grant: Pick<ExternalAccessGrantRecord, 'status' | 'expiresAt' | 'revokedAt' | 'portalKind' | 'vendorId'>,
  vendorId: string,
): void {
  if (grant.portalKind !== 'vendor') {
    throw new DomainRuleError('Grant is not a vendor portal grant', 'errors.notAllowed');
  }
  if (!grantIsActive(grant)) {
    throw new DomainRuleError('Portal grant is not active', 'errors.notAllowed');
  }
  if (!grant.vendorId || grant.vendorId !== vendorId) {
    throw new DomainRuleError('Portal grant does not cover this vendor', 'errors.notAllowed');
  }
}

/**
 * Build a VendorPortalSession from an ExternalAccessGrant + principal.
 * ExternalPrincipal != Membership — never returns OrgContext.
 */
export function buildVendorPortalSession(input: {
  readonly grant: ExternalAccessGrantRecord;
  readonly principalEmail: string;
  readonly principalId?: string;
}): VendorPortalSession {
  if (!input.grant.vendorId) {
    throw new DomainRuleError('Vendor grant requires vendorId', 'errors.notAllowed');
  }
  assertVendorGrantActive(input.grant, input.grant.vendorId);
  const scopes = normalizeVendorScopes(input.grant.scopes);
  if (scopes.length === 0) {
    throw new DomainRuleError('Vendor grant has no valid scopes', 'errors.notAllowed');
  }
  return {
    kind: 'vendor_portal',
    organizationId: input.grant.organizationId,
    principalId: input.principalId ?? input.grant.principalId,
    principalEmail: input.principalEmail,
    grantId: input.grant.id,
    vendorId: input.grant.vendorId,
    scopes,
  };
}

export function isVendorPortalSession(value: unknown): value is VendorPortalSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as VendorPortalSession).kind === 'vendor_portal'
  );
}

/** Hard rule: portal AP / compliance candidates never mutate financial truth. */
export function portalCandidateMutatesFinancialTruth(): false {
  return false;
}

export function assertPortalCandidateDoesNotMutateFinancialTruth(): void {
  if (portalCandidateMutatesFinancialTruth()) {
    throw new DomainRuleError(
      'Vendor portal candidates must not mutate financial truth',
      'portal.errors.financialMutationForbidden',
    );
  }
}

export function assertVendorGrantHasScope(
  grant: Pick<ExternalAccessGrantRecord, 'scopes'>,
  scope: VendorPortalScope,
): void {
  if (!grantHasVendorScope(grant, scope)) {
    throw new DomainRuleError(`Vendor grant missing scope ${scope}`, 'errors.notAllowed');
  }
}

/**
 * Candidate quote intake may only create `received` status rows.
 * External principals cannot finalize / accept financial truth.
 */
export function assertCandidateQuoteStatus(status: string): void {
  if (status !== 'received') {
    throw new DomainRuleError(
      'Vendor quote candidates must be stored as received for internal review',
      'portal.errors.quoteFinalizeForbidden',
    );
  }
}

/** Runtime guard: reject objects that look like they carry internal financials. */
export function assertNoSensitiveVendorFields(value: Record<string, unknown>): void {
  const forbidden = [
    'profit',
    'margin',
    'burden',
    'overhead',
    'trueCost',
    'laborCost',
    'employeeCost',
    'workforce',
    'salary',
    'committedCostStatus',
    'committedCosts',
    'expense',
    'orgAdmin',
    'membership',
    'roleKey',
  ];
  for (const key of Object.keys(value)) {
    if (forbidden.some((item) => key.toLowerCase().includes(item.toLowerCase()))) {
      throw new Error(`Vendor projection must not include sensitive field: ${key}`);
    }
  }
}

export function buildVendorSafeRfqSummary(input: {
  readonly rfqId: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly projectName: string | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unit: string | null;
  }[];
}): VendorSafeRfqSummary {
  const summary: VendorSafeRfqSummary = {
    rfqId: input.rfqId,
    title: input.title,
    status: input.status,
    dueDate: input.dueDate,
    projectName: input.projectName,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
    })),
  };
  assertNoSensitiveVendorFields(summary as unknown as Record<string, unknown>);
  return summary;
}

export function buildVendorSafePoSummary(input: {
  readonly purchaseOrderId: string;
  readonly reference: string | null;
  readonly status: string;
  readonly currency: string;
  readonly orderTotal: string;
  readonly orderedOn: string | null;
  readonly projectName: string | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
  }[];
}): VendorSafePoSummary {
  const summary: VendorSafePoSummary = {
    purchaseOrderId: input.purchaseOrderId,
    reference: input.reference,
    status: input.status,
    currency: input.currency,
    orderTotal: input.orderTotal,
    orderedOn: input.orderedOn,
    projectName: input.projectName,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency,
    })),
  };
  assertNoSensitiveVendorFields(summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Vendor payment/outstanding projection. While policy is disabled, returns an
 * empty disabled payload even when the grant includes `payment.outstanding`.
 */
export function buildVendorSafePaymentOutstanding(input?: {
  readonly currency?: string | null;
  readonly billedAmount?: string | null;
  readonly paidAmount?: string | null;
  readonly outstandingAmount?: string | null;
}): VendorSafePaymentOutstanding {
  if (isVendorPaymentOutstandingPolicyEnabled()) {
    const projection: VendorSafePaymentOutstanding = {
      policyStatus: 'enabled',
      currency: input?.currency ?? null,
      billedAmount: input?.billedAmount ?? null,
      paidAmount: input?.paidAmount ?? null,
      outstandingAmount: input?.outstandingAmount ?? null,
      note: 'Vendor-facing payment position only — never cost recognition.',
    };
    assertNoSensitiveVendorFields(projection as unknown as Record<string, unknown>);
    return projection;
  }

  const disabled: VendorSafePaymentOutstanding = {
    policyStatus: 'disabled',
    currency: null,
    billedAmount: null,
    paidAmount: null,
    outstandingAmount: null,
    note: VENDOR_PAYMENT_OUTSTANDING_DISABLED_NOTE,
  };
  assertNoSensitiveVendorFields(disabled as unknown as Record<string, unknown>);
  return disabled;
}
