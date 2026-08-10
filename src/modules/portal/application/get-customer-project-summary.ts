import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { fromNumericString, money, subtractMoney, sumMoney } from '@/shared/money';
import { aggregateBillingPositionInCurrency } from '@/modules/billing/domain/outstanding';
import { listProjectBillingAmountRows } from '@/modules/billing';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerPortalSession,
  buildCustomerSafeBillingItems,
  buildCustomerSafeDocuments,
  buildCustomerSafeMilestones,
  buildCustomerSafeProjectSummary,
  grantCoversProject,
  grantIsActive,
  isCustomerPortalSession,
  normalizeCustomerScopes,
  CUSTOMER_PORTAL_NEVER_EXPOSED,
} from '../domain/safe-project-summary';
import { getExternalPublicAccessStatus } from '../domain/external-access-policy';
import { assertGrantBelongsToOrganization } from '../domain/tenant-isolation';
import type {
  CustomerPortalScope,
  CustomerSafeBillingItem,
  CustomerSafeDocument,
  CustomerSafeMilestone,
  CustomerSafeProjectSummary,
} from '../domain/types';
import {
  findGrantById,
  findProjectForPortal,
  listCustomerSafeBillingRows,
  listCustomerSafeProjectDocuments,
  listCustomerSafeProjectMilestones,
} from '../data/portal.repository';
import {
  customerProjectSummarySchema,
  type CustomerProjectSummaryInput,
} from '../validation/schemas';

export type CustomerPortalDenialReason =
  | 'grant_inactive'
  | 'cross_customer'
  | 'scope_denied'
  | 'not_found';

/**
 * Admin-mediated customer portal preview result.
 * Public login remains DISABLED (not merely foundation-only).
 */
export interface CustomerPortalPreviewResult {
  readonly ok: boolean;
  readonly summary: CustomerSafeProjectSummary | null;
  readonly denialReason: CustomerPortalDenialReason | null;
  readonly message: string | null;
  readonly scopesApplied: readonly CustomerPortalScope[];
  readonly neverExposed: readonly (typeof CUSTOMER_PORTAL_NEVER_EXPOSED)[number][];
  readonly documents: readonly CustomerSafeDocument[];
  readonly milestones: readonly CustomerSafeMilestone[];
  readonly publicLoginStatus: 'disabled';
  readonly publicAccessLimitation: string;
  /** ExternalPrincipal ≠ OrganizationMembership. */
  readonly identityModel: 'external_principal';
}

/**
 * Internal preview / foundation reader for the customer-safe project projection.
 * Never returns costs, profit, workforce rates, vendor confidential, or overhead.
 */
export async function getCustomerSafeProjectSummary(
  context: OrgContext,
  rawInput: CustomerProjectSummaryInput,
): Promise<CustomerSafeProjectSummary> {
  const preview = await previewCustomerPortalAccess(context, rawInput);
  if (!preview.ok || !preview.summary) {
    if (preview.denialReason === 'not_found') throw new NotFoundError('Project');
    throw new DomainRuleError(
      preview.message ?? 'Portal access denied',
      preview.denialReason === 'cross_customer'
        ? 'portal.errors.crossCustomer'
        : preview.denialReason === 'grant_inactive'
          ? 'portal.errors.grantInactive'
          : 'errors.notAllowed',
    );
  }
  return preview.summary;
}

/**
 * Structured admin preview: returns denial reasons instead of only throwing,
 * so Settings → Portal can show cross-customer denial clearly.
 */
export async function previewCustomerPortalAccess(
  context: OrgContext,
  rawInput: CustomerProjectSummaryInput,
): Promise<CustomerPortalPreviewResult> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const publicAccess = getExternalPublicAccessStatus();
  const base = {
    neverExposed: [...CUSTOMER_PORTAL_NEVER_EXPOSED],
    documents: [] as CustomerSafeDocument[],
    milestones: [] as CustomerSafeMilestone[],
    publicLoginStatus: 'disabled' as const,
    publicAccessLimitation: publicAccess.limitation,
    identityModel: 'external_principal' as const,
  };

  const parsed = customerProjectSummarySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const project = await findProjectForPortal(context.db, context.organizationId, input.projectId);
  if (!project) {
    return {
      ...base,
      ok: false,
      summary: null,
      denialReason: 'not_found',
      message: 'Project not found',
      scopesApplied: [],
    };
  }

  let scopes: CustomerPortalScope[] = normalizeCustomerScopes(
    input.scopes ?? ['project.summary'],
  );

  if (input.grantId) {
    const grant = await findGrantById(context.organizationId, input.grantId);
    if (!grant || grant.portalKind !== 'customer') {
      return {
        ...base,
        ok: false,
        summary: null,
        denialReason: 'not_found',
        message: 'Portal grant not found',
        scopesApplied: [],
      };
    }
    assertGrantBelongsToOrganization(grant, context.organizationId);
    if (!grantIsActive(grant)) {
      return {
        ...base,
        ok: false,
        summary: null,
        denialReason: 'grant_inactive',
        message: 'Portal grant is not active',
        scopesApplied: normalizeCustomerScopes([...grant.scopes]),
      };
    }
    if (!grantCoversProject(grant, project)) {
      return {
        ...base,
        ok: false,
        summary: null,
        denialReason: 'cross_customer',
        message: 'Portal grant does not cover this project (cross-customer denial)',
        scopesApplied: normalizeCustomerScopes([...grant.scopes]),
      };
    }

    // Session shape proves ExternalPrincipal ≠ Membership (public login still disabled).
    const session = buildCustomerPortalSession({
      grant,
      principalEmail: 'preview@external',
    });
    if (!isCustomerPortalSession(session)) {
      return {
        ...base,
        ok: false,
        summary: null,
        denialReason: 'scope_denied',
        message: 'ExternalPrincipal session must not be treated as membership',
        scopesApplied: normalizeCustomerScopes([...grant.scopes]),
      };
    }
    if (session.organizationId !== context.organizationId) {
      return {
        ...base,
        ok: false,
        summary: null,
        denialReason: 'cross_customer',
        message: 'Cross-tenant portal access denied',
        scopesApplied: normalizeCustomerScopes([...grant.scopes]),
      };
    }

    scopes = normalizeCustomerScopes([...grant.scopes]);
  }

  if (
    !scopes.includes('project.summary') &&
    !scopes.includes('billing.outstanding') &&
    !scopes.includes('milestones.read')
  ) {
    return {
      ...base,
      ok: false,
      summary: null,
      denialReason: 'scope_denied',
      message: 'Grant scopes do not allow project summary',
      scopesApplied: scopes,
    };
  }

  let outstanding: { amount: string; currency: string } | null = null;
  let billing: {
    invoicedAmount: string;
    paidAmount: string;
    currency: string;
    items: CustomerSafeBillingItem[];
  } | null = null;

  if (scopes.includes('billing.outstanding')) {
    const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
    const rows = await listProjectBillingAmountRows(
      context.db,
      context.organizationId,
      project.id,
    );
    const position = aggregateBillingPositionInCurrency(
      rows.map((row) => ({
        kind: row.kind,
        status: row.status,
        totalAmount: fromNumericString(row.totalAmount, row.currency)!,
        payments: row.payments.map((payment) => ({
          amount: fromNumericString(payment.amount, payment.currency)!,
          status: payment.status,
        })),
      })),
      currency,
    );
    outstanding = {
      amount: position.outstanding.amount,
      currency: position.outstanding.currency,
    };

    const billingRows = await listCustomerSafeBillingRows(
      context.db,
      context.organizationId,
      project.id,
    );
    const items = buildCustomerSafeBillingItems(
      billingRows.map((row) => {
        const paid = sumMoney(
          row.payments.map((payment) => money(payment.amount, payment.currency)),
          row.currency,
        );
        const total = money(row.totalAmount, row.currency);
        return {
          id: row.id,
          reference: row.reference,
          kind: row.kind,
          status: row.status,
          issueDate: row.issueDate,
          dueDate: row.dueDate,
          totalAmount: row.totalAmount,
          paidAmount: paid.amount,
          outstandingAmount: subtractMoney(total, paid).amount,
          currency: row.currency,
          payments: row.payments,
        };
      }),
    );

    billing = {
      invoicedAmount: position.invoiced.amount,
      paidAmount: position.paid.amount,
      currency: position.outstanding.currency,
      items,
    };
  }

  let documents: CustomerSafeDocument[] = [];
  if (scopes.includes('documents.read')) {
    const rows = await listCustomerSafeProjectDocuments(
      context.db,
      context.organizationId,
      project.id,
    );
    documents = buildCustomerSafeDocuments(rows);
  }

  let milestones: CustomerSafeMilestone[] = [];
  if (scopes.includes('milestones.read')) {
    const rows = await listCustomerSafeProjectMilestones(
      context.db,
      context.organizationId,
      project.id,
    );
    milestones = buildCustomerSafeMilestones(rows);
  }

  const summary = buildCustomerSafeProjectSummary({
    projectId: project.id,
    name: project.name,
    status: project.status,
    progressPercent: project.progressPercent,
    progressStatus: project.progressStatus,
    startDate: project.startDate,
    targetEndDate: project.targetEndDate,
    location: project.location,
    description: project.description,
    clientName: project.clientName,
    outstanding,
    billing,
    documents,
    milestones,
    scopes,
  });

  assertNoSensitiveCustomerFields(summary as unknown as Record<string, unknown>);
  for (const doc of summary.documents ?? []) {
    assertNoSensitiveCustomerFields(doc as unknown as Record<string, unknown>);
  }
  for (const milestone of summary.milestones ?? []) {
    assertNoSensitiveCustomerFields(milestone as unknown as Record<string, unknown>);
    if ('notes' in (milestone as object)) {
      throw new Error('Customer milestone must not include notes');
    }
  }

  return {
    ...base,
    ok: true,
    summary,
    denialReason: null,
    message: null,
    scopesApplied: scopes,
    documents: summary.documents ?? [],
    milestones: summary.milestones ?? [],
  };
}
