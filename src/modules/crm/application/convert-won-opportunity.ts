import { convertQuote } from '@/modules/quotes/application/convert-quote';
import { convertWonUsesEstimatesTable } from '@/modules/quotes/domain/product-path';
import { listQuotes } from '@/modules/quotes/lookups';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAllPermissions } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findOpportunityById } from '../data/crm.repository';
import {
  assertCanConvertOpportunity,
  resolveCompletedConversion,
} from '../domain/conversion';
import { CRM_AUDIT_ACTIONS, type OpportunityRecord } from '../domain/types';
import {
  convertWonOpportunitySchema,
  type ConvertWonOpportunityInput,
} from '../validation/schemas';

export interface ConvertWonOpportunityResult {
  readonly opportunity: OpportunityRecord;
  readonly clientId: string;
  readonly projectId: string;
  readonly contractId: string;
  /** True when an earlier conversion was reused (no new Client/Project/Contract). */
  readonly idempotent?: boolean;
}

/**
 * Won conversion uses the owner-facing `/quotes` path (`estimates` table).
 * CRM `crm_sales_quotes` are not the commercial bid.
 */
export async function convertWonOpportunity(
  context: OrgContext,
  rawInput: ConvertWonOpportunityInput,
): Promise<ConvertWonOpportunityResult> {
  assertAllPermissions(context, [
    PERMISSIONS.CRM_MANAGE,
    PERMISSIONS.QUOTES_MANAGE,
    PERMISSIONS.CLIENTS_MANAGE,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_UPDATE,
    PERMISSIONS.CONTRACTS_MANAGE,
  ]);

  const parsed = convertWonOpportunitySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError('Opportunity');

  const completed = resolveCompletedConversion(opportunity);
  if (completed) {
    return {
      opportunity,
      clientId: completed.clientId,
      projectId: completed.projectId,
      contractId: completed.contractId,
      idempotent: true,
    };
  }

  assertCanConvertOpportunity(opportunity);
  convertWonUsesEstimatesTable();

  const productQuotes = await listQuotes(context.db, context.organizationId, {
    opportunityId: opportunity.id,
  });
  const alreadyConverted = productQuotes.find(
    (quote) => quote.status === 'converted' && quote.convertedProjectId,
  );
  if (alreadyConverted?.convertedProjectId) {
    const refreshed = await findOpportunityById(
      context.db,
      context.organizationId,
      opportunity.id,
    );
    const linked = refreshed ?? opportunity;
    return {
      opportunity: linked,
      clientId: linked.convertedClientId ?? '',
      projectId: alreadyConverted.convertedProjectId,
      contractId: linked.convertedContractId ?? '',
      idempotent: true,
    };
  }

  const accepted = productQuotes.find((quote) => quote.status === 'accepted');
  if (!accepted) {
    throw new DomainRuleError(
      'Create and accept a product quote at /quotes before converting',
      'crm.errors.useProductQuote',
    );
  }

  const result = await convertQuote(context, {
    quoteId: accepted.id,
    workKind: 'project',
    projectName: input.projectName,
    amountIncludesTax: input.amountIncludesTax,
  });

  const updated = await findOpportunityById(
    context.db,
    context.organizationId,
    opportunity.id,
  );
  if (!updated) throw new NotFoundError('Opportunity');

  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.OPPORTUNITY_CONVERTED,
    entityType: 'crm_opportunity',
    entityId: updated.id,
    after: {
      clientId: updated.convertedClientId,
      projectId: result.projectId,
      contractId: updated.convertedContractId,
      estimateId: result.quote.id,
      table: 'estimates',
      vatIsNotProfit: true,
    },
  });

  return {
    opportunity: updated,
    clientId: updated.convertedClientId ?? '',
    projectId: result.projectId,
    contractId: updated.convertedContractId ?? '',
  };
}
