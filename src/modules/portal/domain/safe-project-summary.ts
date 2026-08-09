import { DomainRuleError } from '@/shared/errors';
import type {
  CustomerPortalSession,
  CustomerSafeDocument,
  CustomerSafeProjectSummary,
  ExternalAccessGrantRecord,
} from './types';
import { CUSTOMER_PORTAL_SCOPES, type CustomerPortalScope } from './types';

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
  readonly documents?: readonly CustomerSafeDocument[] | null;
  readonly scopes: readonly string[];
}

export const CUSTOMER_PORTAL_NEVER_EXPOSED = [
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
] as const;

/** Strip internal storage / admin fields from project document rows. */
export function buildCustomerSafeDocuments(
  rows: readonly {
    id: string;
    originalFilename: string;
    label: string | null;
    mimeType: string;
    sizeBytes: number | null;
  }[],
): CustomerSafeDocument[] {
  return rows.map((row) => {
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
  return result;
}

/** Runtime guard: reject objects that look like they carry internal financials. */
export function assertNoSensitiveCustomerFields(value: Record<string, unknown>): void {
  const forbidden = [
    'cost',
    'costs',
    'profit',
    'margin',
    'rate',
    'rates',
    'burden',
    'overhead',
    'workforce',
    'vendorCost',
    'vendorConfidential',
    'trueCost',
    'laborCost',
    'storagePath',
    'storageBucket',
    'checksum',
    'uploadedBy',
    'audit',
    'membership',
    'roleKey',
  ];
  for (const key of Object.keys(value)) {
    if (
      forbidden.some(
        (item) => key.toLowerCase().includes(item.toLowerCase()) && key !== 'outstanding',
      )
    ) {
      throw new Error(`Customer summary must not include sensitive field: ${key}`);
    }
  }
}
