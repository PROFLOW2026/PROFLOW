import { DomainRuleError } from '@/shared/errors';
import type {
  CustomerPortalSession,
  CustomerSafeBillingItem,
  CustomerSafeDocument,
  CustomerSafeMilestone,
  CustomerSafeProjectSummary,
  CustomerSafeQuote,
  ExternalAccessGrantRecord,
} from './types';
import { CUSTOMER_PORTAL_SCOPES, type CustomerPortalScope } from './types';
import { filterCustomerPortalSharedDocuments } from './shared-documents';

const CUSTOMER_SCOPE_SET = new Set<string>(CUSTOMER_PORTAL_SCOPES);

export function isCustomerPortalScope(value: string): value is CustomerPortalScope {
  return CUSTOMER_SCOPE_SET.has(value);
}

export function normalizeCustomerScopes(scopes: readonly string[]): CustomerPortalScope[] {
  const unique = new Set<CustomerPortalScope>();
  for (const scope of scopes) {
    if (isCustomerPortalScope(scope)) unique.add(scope);
  }
  return [...unique];
}

export function grantIsActive(
  grant: Pick<ExternalAccessGrantRecord, 'status' | 'expiresAt' | 'revokedAt'>,
  now: Date = new Date(),
): boolean {
  if (grant.status !== 'active') return false;
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function grantCoversProject(
  grant: Pick<ExternalAccessGrantRecord, 'projectId' | 'clientId'>,
  project: { id: string; clientId: string | null },
): boolean {
  if (grant.projectId && grant.projectId === project.id) return true;
  if (grant.clientId && project.clientId && grant.clientId === project.clientId) return true;
  return false;
}

/**
 * Build a CustomerPortalSession from an ExternalAccessGrant + principal.
 * ExternalPrincipal ≠ Membership — never returns OrgContext.
 */
export function buildCustomerPortalSession(input: {
  readonly grant: ExternalAccessGrantRecord;
  readonly principalEmail: string;
  readonly principalId?: string;
}): CustomerPortalSession {
  if (input.grant.portalKind !== 'customer') {
    throw new DomainRuleError('Grant is not a customer portal grant', 'errors.notAllowed');
  }
  if (!grantIsActive(input.grant)) {
    throw new DomainRuleError('Portal grant is not active', 'errors.notAllowed');
  }
  const scopes = normalizeCustomerScopes(input.grant.scopes);
  if (scopes.length === 0) {
    throw new DomainRuleError('Customer grant has no valid scopes', 'errors.notAllowed');
  }
  return {
    kind: 'customer_portal',
    organizationId: input.grant.organizationId,
    principalId: input.principalId ?? input.grant.principalId,
    principalEmail: input.principalEmail,
    grantId: input.grant.id,
    clientId: input.grant.clientId,
    projectId: input.grant.projectId,
    scopes,
  };
}

export function isCustomerPortalSession(value: unknown): value is CustomerPortalSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as CustomerPortalSession).kind === 'customer_portal'
  );
}

export interface SafeProjectSummaryInput {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly progressPercent: string | null;
  readonly progressStatus: string | null;
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly clientName: string | null;
  readonly outstanding?: { amount: string; currency: string } | null;
  readonly billing?: {
    invoicedAmount: string;
    paidAmount: string;
    currency: string;
    items: readonly CustomerSafeBillingItem[];
  } | null;
  readonly documents?: readonly CustomerSafeDocument[] | null;
  readonly milestones?: readonly CustomerSafeMilestone[] | null;
  readonly quotes?: readonly CustomerSafeQuote[] | null;
  readonly scopes: readonly string[];
}

export const CUSTOMER_PORTAL_NEVER_EXPOSED = [
  'actual',
  'profit',
  'margin',
  'trueCost',
  'employeeCost',
  'overhead',
  'laborRate',
  'vendorConfidential',
  'admin',
  'audit',
  'storagePath',
  'internalNotes',
  'supplierPricing',
  'estimatedCost',
  'estimatedMargin',
] as const;

/** Statuses a customer may see once `quotes.read` is granted. */
export const CUSTOMER_VISIBLE_QUOTE_STATUSES = [
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
] as const;

/** Strip internal storage / admin fields; keep only explicitly shared docs. */
export function buildCustomerSafeDocuments(
  rows: readonly {
    id: string;
    originalFilename: string;
    label: string | null;
    portalVisible?: boolean | null;
    mimeType: string;
    sizeBytes: number | null;
  }[],
): CustomerSafeDocument[] {
  return filterCustomerPortalSharedDocuments(rows).map((row) => {
    const doc: CustomerSafeDocument = {
      documentId: row.id,
      filename: row.originalFilename,
      label: row.label,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    };
    assertNoSensitiveCustomerFields(doc as unknown as Record<string, unknown>);
    return doc;
  });
}

/**
 * Customer-safe milestones — name/status/dates only.
 * Internal notes are never accepted into the projection.
 */
export function buildCustomerSafeMilestones(
  rows: readonly {
    id: string;
    name: string;
    status: string;
    targetDate: string | null;
    completedAt: string | null;
    notes?: string | null;
  }[],
): CustomerSafeMilestone[] {
  return rows.map((row) => {
    const milestone: CustomerSafeMilestone = {
      milestoneId: row.id,
      name: row.name,
      status: row.status,
      targetDate: row.targetDate,
      completedAt: row.completedAt,
    };
    assertNoSensitiveCustomerFields(milestone as unknown as Record<string, unknown>);
    return milestone;
  });
}

/**
 * Customer-safe commercial quotes. Strips estimated cost/margin and notes.
 * Draft/ready quotes stay internal until sent.
 */
export function buildCustomerSafeQuotes(
  rows: readonly {
    id: string;
    title: string;
    status: string;
    currency: string;
    totalAmount: string | null;
    validityDate: string | null;
    sentAt: Date | string | null;
    estimatedCostAmount?: string | null;
    estimatedMarginPercent?: string | null;
    notes?: string | null;
  }[],
): CustomerSafeQuote[] {
  const visible = new Set<string>(CUSTOMER_VISIBLE_QUOTE_STATUSES);
  return rows
    .filter((row) => visible.has(row.status))
    .map((row) => {
      const quote: CustomerSafeQuote = {
        quoteId: row.id,
        title: row.title,
        status: row.status,
        currency: row.currency,
        totalAmount: row.totalAmount,
        validityDate: row.validityDate,
        sentAt:
          row.sentAt instanceof Date
            ? row.sentAt.toISOString()
            : row.sentAt
              ? String(row.sentAt)
              : null,
      };
      assertNoSensitiveCustomerFields(quote as unknown as Record<string, unknown>);
      return quote;
    });
}

/**
 * Customer-safe billing + payment rows. Excludes draft/void and strips notes.
 */
export function buildCustomerSafeBillingItems(
  rows: readonly {
    id: string;
    reference: string | null;
    kind: string;
    status: string;
    issueDate: string | null;
    dueDate: string | null;
    totalAmount: string;
    paidAmount: string;
    outstandingAmount: string;
    currency: string;
    payments: readonly {
      amount: string;
      currency: string;
      status: string;
      paymentDate: string | null;
      reference: string | null;
    }[];
  }[],
): CustomerSafeBillingItem[] {
  return rows
    .filter((row) => row.status !== 'draft' && row.status !== 'void')
    .map((row) => {
      const item: CustomerSafeBillingItem = {
        billingRecordId: row.id,
        reference: row.reference,
        kind: row.kind,
        status: row.status,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        totalAmount: row.totalAmount,
        paidAmount: row.paidAmount,
        outstandingAmount: row.outstandingAmount,
        currency: row.currency,
        payments: row.payments
          .filter((payment) => payment.status !== 'void')
          .map((payment) => ({
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            paymentDate: payment.paymentDate,
            reference: payment.reference,
          })),
      };
      assertNoSensitiveCustomerFields(item as unknown as Record<string, unknown>);
      return item;
    });
}

/**
 * Builds the customer-safe projection. Sensitive internal fields are never
 * accepted as parameters — callers cannot accidentally leak costs/profit/rates.
 */
export function buildCustomerSafeProjectSummary(
  input: SafeProjectSummaryInput,
): CustomerSafeProjectSummary {
  const scopes = normalizeCustomerScopes(input.scopes);
  const summary: CustomerSafeProjectSummary = {
    projectId: input.projectId,
    name: input.name,
    status: input.status,
    progressPercent: input.progressPercent,
    progressStatus: input.progressStatus,
    startDate: input.startDate,
    targetEndDate: input.targetEndDate,
    location: input.location,
    description: input.description,
    clientName: input.clientName,
  };

  let result = summary;
  if (scopes.includes('billing.outstanding') && input.outstanding) {
    result = {
      ...result,
      outstanding: {
        amount: input.outstanding.amount,
        currency: input.outstanding.currency,
      },
    };
  }
  if (scopes.includes('billing.outstanding') && input.billing) {
    result = {
      ...result,
      billing: {
        invoicedAmount: input.billing.invoicedAmount,
        paidAmount: input.billing.paidAmount,
        currency: input.billing.currency,
        items: input.billing.items.map((item) => ({
          billingRecordId: item.billingRecordId,
          reference: item.reference,
          kind: item.kind,
          status: item.status,
          issueDate: item.issueDate,
          dueDate: item.dueDate,
          totalAmount: item.totalAmount,
          paidAmount: item.paidAmount,
          outstandingAmount: item.outstandingAmount,
          currency: item.currency,
          payments: item.payments.map((payment) => ({
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            paymentDate: payment.paymentDate,
            reference: payment.reference,
          })),
        })),
      },
    };
  }
  if (scopes.includes('documents.read') && input.documents && input.documents.length > 0) {
    result = {
      ...result,
      documents: input.documents.map((doc) => ({
        documentId: doc.documentId,
        filename: doc.filename,
        label: doc.label,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
      })),
    };
  }
  if (scopes.includes('milestones.read') && input.milestones && input.milestones.length > 0) {
    result = {
      ...result,
      milestones: input.milestones.map((milestone) => ({
        milestoneId: milestone.milestoneId,
        name: milestone.name,
        status: milestone.status,
        targetDate: milestone.targetDate,
        completedAt: milestone.completedAt,
      })),
    };
  }
  if (scopes.includes('quotes.read') && input.quotes && input.quotes.length > 0) {
    result = {
      ...result,
      quotes: input.quotes.map((quote) => ({
        quoteId: quote.quoteId,
        title: quote.title,
        status: quote.status,
        currency: quote.currency,
        totalAmount: quote.totalAmount,
        validityDate: quote.validityDate,
        sentAt: quote.sentAt,
      })),
    };
  }
  return result;
}

/** Runtime guard: reject objects that look like they carry internal financials. */
export function assertNoSensitiveCustomerFields(value: Record<string, unknown>): void {
  /** Short tokens — exact match only (avoid `contractual` ⊃ `actual`). */
  const exactForbidden = new Set([
    'actual',
    'actuals',
    'cost',
    'costs',
    'rate',
    'rates',
    'notes',
    'audit',
  ]);
  const substringForbidden = [
    'profit',
    'margin',
    'burden',
    'overhead',
    'workforce',
    'vendorCost',
    'vendorConfidential',
    'trueCost',
    'laborCost',
    'employeeCost',
    'actualCost',
    'actualAmount',
    'supplierPricing',
    'storagePath',
    'storageBucket',
    'checksum',
    'uploadedBy',
    'membership',
    'roleKey',
    'internalNotes',
    'estimatedCost',
    'estimatedCostAmount',
    'estimatedMargin',
    'estimatedMarginPercent',
    'estimatedUnitCost',
    'estimatedUnitCostAmount',
  ];
  for (const key of Object.keys(value)) {
    const lower = key.toLowerCase();
    if (exactForbidden.has(lower)) {
      throw new Error(`Customer summary must not include sensitive field: ${key}`);
    }
    if (
      substringForbidden.some((item) => lower.includes(item.toLowerCase())) &&
      key !== 'outstanding' &&
      key !== 'outstandingAmount'
    ) {
      throw new Error(`Customer summary must not include sensitive field: ${key}`);
    }
  }
}
