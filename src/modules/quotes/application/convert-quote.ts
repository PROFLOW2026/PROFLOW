import { and, eq } from 'drizzle-orm';
import { contracts, projects } from '@drizzle/schema';
import {
  findLeadById,
  findOpportunityById,
  findProspectById,
  updateLeadById,
  updateOpportunityById,
  updateProspectById,
} from '@/modules/crm/lookups';
import { createProject, createJob, updateProject } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAllPermissions, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertCanConvertQuote,
  contractEnteredAmountFromQuote,
  isQuoteAlreadyConverted,
  resolveCompletedQuoteConversion,
} from '../domain/conversion';
import { assertQuoteIsNotBilling } from '../domain/lifecycle';
import { QUOTES_AUDIT_ACTIONS, type QuoteRecord } from '../domain/types';
import {
  findQuoteById,
  markQuoteConvertedIfAccepted,
} from '../data/quotes.repository';
import { convertQuoteSchema, type ConvertQuoteInput } from '../validation/schemas';
import { recordQuoteClientActivity } from './timeline-events';

export interface ConvertQuoteResult {
  readonly quote: QuoteRecord;
  readonly projectId: string;
  readonly workKind: 'project' | 'job';
  /** True when an earlier conversion was reused. */
  readonly idempotent?: boolean;
}

/**
 * Accepted quote → create project or job via existing entity APIs.
 * Seeds client / contact / description / opening contract (net) carefully.
 * Does NOT create billing records or change orders. Quote ≠ Revenue.
 */
export async function convertQuote(
  context: OrgContext,
  rawInput: ConvertQuoteInput,
): Promise<ConvertQuoteResult> {
  assertAllPermissions(context, [
    PERMISSIONS.QUOTES_MANAGE,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_UPDATE,
    PERMISSIONS.CONTRACTS_MANAGE,
  ]);

  const parsed = convertQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const quote = await findQuoteById(context.db, context.organizationId, input.quoteId);
  if (!quote) throw new NotFoundError('Quote');

  const completed = resolveCompletedQuoteConversion(quote);
  if (completed && isQuoteAlreadyConverted(quote)) {
    let workKind: 'project' | 'job' = input.workKind;
    const [projectRow] = await context.db
      .select({ workKind: projects.workKind })
      .from(projects)
      .where(
        and(
          eq(projects.id, completed.projectId),
          eq(projects.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    if (projectRow?.workKind === 'job' || projectRow?.workKind === 'project') {
      workKind = projectRow.workKind;
    }
    return {
      quote,
      projectId: completed.projectId,
      workKind,
      idempotent: true,
    };
  }

  assertCanConvertQuote(quote);
  assertQuoteIsNotBilling();

  const workKind = input.workKind;
  const projectName = input.projectName?.trim() || quote.title;
  const currency = quote.currency.toUpperCase();
  const amountIncludesTax = input.amountIncludesTax ?? false;
  const { enteredAmount, amountIncludesTax: inclusive } = contractEnteredAmountFromQuote(
    quote,
    amountIncludesTax,
  );
  const startDate = todayInTimeZone(context.organization.timezone);

  let projectId: string;
  let convertedClientId: string | null = quote.clientId;

  if (workKind === 'job') {
    const pricingMode = input.pricingMode ?? 'fixed';
    if (!quote.clientId) {
      throw new DomainRuleError(
        'A client is required to convert a quote into a job',
        'quotes.errors.clientRequiredForJob',
      );
    }
    const result = await createJob(context, {
      name: projectName,
      description: quote.description ?? undefined,
      clientId: quote.clientId,
      pricingMode,
      priceAmount: pricingMode === 'fixed' ? enteredAmount : undefined,
      priceCurrency: currency,
      amountIncludesTax: pricingMode === 'fixed' ? inclusive : undefined,
      startDate,
      notes: quote.notes ?? undefined,
      status: 'active',
    });
    projectId = result.projectId;
    convertedClientId = result.clientId ?? quote.clientId;

    if (quote.contactId) {
      await updateProject(context, {
        projectId,
        primaryContactId: quote.contactId,
      });
    }
  } else {
    // createProject upserts primary contract when amount present (net via tax authority).
    const result = await createProject(context, {
      name: projectName,
      description: quote.description ?? undefined,
      clientId: quote.clientId ?? undefined,
      primaryContactId: quote.contactId ?? undefined,
      workKind: 'project',
      contractValueAmount: enteredAmount,
      contractValueCurrency: currency,
      amountIncludesTax: inclusive,
      startDate,
      notes: quote.notes ?? undefined,
      status: 'active',
    });
    projectId = result.projectId;
    convertedClientId = result.clientId ?? quote.clientId;
  }

  const convertedAt = new Date();
  const updated = await markQuoteConvertedIfAccepted(
    context.db,
    context.organizationId,
    quote.id,
    {
      convertedProjectId: projectId,
      convertedAt,
      decidedAt: quote.decidedAt ?? convertedAt,
    },
  );
  if (!updated) {
    // Lost the race - another convert claimed the quote. Throwing rolls back
    // this request transaction (including the project created above).
    const raced = await findQuoteById(context.db, context.organizationId, quote.id);
    if (raced?.convertedProjectId) {
      throw new DomainRuleError(
        'Quote was converted concurrently - refresh and open the existing project',
        'quotes.errors.alreadyConverted',
        { projectId: raced.convertedProjectId },
      );
    }
    throw new NotFoundError('Quote');
  }

  await noteModuleUsage(context.db, context.organizationId, 'quotes');
  await recordAuditEvent(context, {
    action: QUOTES_AUDIT_ACTIONS.CONVERTED,
    entityType: 'estimate_quote',
    entityId: updated.id,
    after: {
      projectId,
      workKind,
      currency,
      enteredAmount,
      amountIncludesTax: inclusive,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      subtotalAmount: quote.subtotalAmount,
      isNotBilling: true,
      isNotRevenue: true,
      vatIsNotProfit: true,
    },
  });

  await recordQuoteClientActivity(context, {
    clientId: convertedClientId,
    projectId,
    kind: 'quote_approved',
    entityType: 'estimate',
    entityId: updated.id,
    summary: updated.title,
    deepLink: `/quotes/${updated.id}`,
  });
  await recordQuoteClientActivity(context, {
    clientId: convertedClientId,
    projectId,
    kind: 'project_created',
    entityType: 'project',
    entityId: projectId,
    summary: projectName,
    deepLink: workKind === 'job' ? `/jobs/${projectId}` : `/projects/${projectId}`,
  });

  await markLinkedOpportunityWon(context, {
    quote: updated,
    projectId,
    clientId: convertedClientId,
  });

  return { quote: updated, projectId, workKind };
}

async function markLinkedOpportunityWon(
  context: OrgContext,
  input: {
    readonly quote: QuoteRecord;
    readonly projectId: string;
    readonly clientId: string | null;
  },
): Promise<void> {
  if (!input.quote.opportunityId) return;
  if (!hasPermission(context, PERMISSIONS.CRM_MANAGE)) return;

  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    input.quote.opportunityId,
  );
  if (!opportunity || opportunity.status === 'lost' || opportunity.status === 'cancelled') return;
  if (opportunity.convertedProjectId && opportunity.convertedProjectId !== input.projectId) return;

  let contractId: string | null = opportunity.convertedContractId;
  const [contract] = await context.db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.projectId, input.projectId),
        eq(contracts.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (contract) contractId = contract.id;

  const clientId = input.clientId ?? opportunity.convertedClientId;

  if (opportunity.prospectId) {
    const prospect = await findProspectById(
      context.db,
      context.organizationId,
      opportunity.prospectId,
    );
    if (prospect && clientId && !prospect.convertedClientId) {
      await updateProspectById(context.db, context.organizationId, prospect.id, {
        status: 'converted',
        convertedClientId: clientId,
      });
    }
  }

  if (opportunity.leadId) {
    const lead = await findLeadById(context.db, context.organizationId, opportunity.leadId);
    if (lead && lead.status !== 'converted') {
      await updateLeadById(context.db, context.organizationId, lead.id, {
        status: 'converted',
      });
    }
  }

  await updateOpportunityById(context.db, context.organizationId, opportunity.id, {
    status: 'won',
    stage: 'won',
    convertedClientId: clientId,
    convertedProjectId: input.projectId,
    convertedContractId: contractId,
    convertedAt: opportunity.convertedAt ?? new Date(),
  });
}
