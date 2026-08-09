import type { CustomerSafeProjectSummary, ExternalAccessGrantRecord } from './types';
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
  readonly scopes: readonly string[];
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

  if (scopes.includes('billing.outstanding') && input.outstanding) {
    return {
      ...summary,
      outstanding: {
        amount: input.outstanding.amount,
        currency: input.outstanding.currency,
      },
    };
  }

  return summary;
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
    'trueCost',
    'laborCost',
  ];
  for (const key of Object.keys(value)) {
    if (forbidden.some((item) => key.toLowerCase().includes(item.toLowerCase()) && key !== 'outstanding')) {
      throw new Error(`Customer summary must not include sensitive field: ${key}`);
    }
  }
}
