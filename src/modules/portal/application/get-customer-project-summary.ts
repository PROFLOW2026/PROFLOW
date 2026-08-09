import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { fromNumericString } from '@/shared/money';
import { aggregateBillingPositionInCurrency } from '@/modules/billing/domain/outstanding';
import { listProjectBillingAmountRows } from '@/modules/billing/data/billing.repository';
import {
  assertNoSensitiveCustomerFields,
  buildCustomerSafeProjectSummary,
  grantCoversProject,
  grantIsActive,
  normalizeCustomerScopes,
} from '../domain/safe-project-summary';
import type { CustomerPortalScope, CustomerSafeProjectSummary } from '../domain/types';
import { findGrantById, findProjectForPortal } from '../data/portal.repository';
import {
  customerProjectSummarySchema,
  type CustomerProjectSummaryInput,
} from '../validation/schemas';

/**
 * Internal preview / foundation reader for the customer-safe project projection.
 * Never returns costs, profit, workforce rates, vendor confidential, or overhead.
 */
export async function getCustomerSafeProjectSummary(
  context: OrgContext,
  rawInput: CustomerProjectSummaryInput,
): Promise<CustomerSafeProjectSummary> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = customerProjectSummarySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const project = await findProjectForPortal(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('Project');

  let scopes: CustomerPortalScope[] = normalizeCustomerScopes(
    input.scopes ?? ['project.summary'],
  );

  if (input.grantId) {
    const grant = await findGrantById(context.organizationId, input.grantId);
    if (!grant || grant.portalKind !== 'customer') throw new NotFoundError('Portal grant');
    if (!grantIsActive(grant)) {
      throw new DomainRuleError('Portal grant is not active', 'errors.notAllowed');
    }
    if (!grantCoversProject(grant, project)) {
      throw new DomainRuleError('Portal grant does not cover this project', 'errors.notAllowed');
    }
    scopes = normalizeCustomerScopes([...grant.scopes]);
  }

  if (!scopes.includes('project.summary') && !scopes.includes('billing.outstanding')) {
    throw new DomainRuleError('Grant scopes do not allow project summary', 'errors.notAllowed');
  }

  let outstanding: { amount: string; currency: string } | null = null;
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
    scopes,
  });

  assertNoSensitiveCustomerFields(summary as unknown as Record<string, unknown>);
  return summary;
}
