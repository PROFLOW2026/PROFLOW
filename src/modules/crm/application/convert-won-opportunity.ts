import { createClient } from '@/modules/clients';
import { createProject, upsertPrimaryContractAmount } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findAcceptedVersionForOpportunity,
  findOpportunityById,
  findProspectById,
  findSalesQuoteVersionById,
  updateOpportunityById,
  updateProspectById,
} from '../data/crm.repository';
import {
  assertCanConvertOpportunity,
  contractNetAmountFromAcceptedQuote,
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
}

/**
 * Explicit win conversion (doc 20 §6): create Client + Project + Contract
 * from the accepted sales quote. Does not invent a second Change Order path.
 */
export async function convertWonOpportunity(
  context: OrgContext,
  rawInput: ConvertWonOpportunityInput,
): Promise<ConvertWonOpportunityResult> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

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

  assertCanConvertOpportunity(opportunity);

  let acceptedVersion = input.salesQuoteVersionId
    ? await findSalesQuoteVersionById(
        context.db,
        context.organizationId,
        input.salesQuoteVersionId,
      )
    : await findAcceptedVersionForOpportunity(
        context.db,
        context.organizationId,
        opportunity.id,
      );

  if (!acceptedVersion) {
    throw new DomainRuleError(
      'An accepted sales quote version is required to convert',
      'crm.errors.acceptedQuoteRequired',
    );
  }

  if (acceptedVersion.status !== 'accepted') {
    throw new DomainRuleError(
      'Selected sales quote version is not accepted',
      'crm.errors.quoteNotAccepted',
    );
  }

  const netAmount = contractNetAmountFromAcceptedQuote(acceptedVersion);
  const currency = acceptedVersion.currency.toUpperCase();
  const amountIncludesTax = input.amountIncludesTax ?? false;

  let clientId: string | null = null;
  const prospect = opportunity.prospectId
    ? await findProspectById(context.db, context.organizationId, opportunity.prospectId)
    : null;

  if (prospect?.convertedClientId) {
    clientId = prospect.convertedClientId;
  } else if (prospect) {
    const client = await createClient(context, {
      name: prospect.companyName?.trim() || prospect.name,
      email: prospect.email ?? undefined,
      phone: prospect.phone ?? undefined,
      notes: prospect.notes ?? undefined,
    });
    clientId = client.id;
    await updateProspectById(context.db, context.organizationId, prospect.id, {
      status: 'converted',
      convertedClientId: client.id,
    });
  } else {
    const client = await createClient(context, {
      name: opportunity.name,
    });
    clientId = client.id;
  }

  const projectName = input.projectName?.trim() || opportunity.name;
  const { projectId } = await createProject(context, {
    name: projectName,
    clientId,
    status: 'active',
    startDate: opportunity.expectedStartDate ?? undefined,
    notes: opportunity.notes ?? undefined,
  });

  const { contract } = await upsertPrimaryContractAmount(context, {
    projectId,
    enteredAmount: amountIncludesTax ? acceptedVersion.totalAmount : netAmount,
    currency,
    amountIncludesTax,
  });

  const convertedAt = new Date();
  const updated = await updateOpportunityById(
    context.db,
    context.organizationId,
    opportunity.id,
    {
      status: 'won',
      stage: 'won',
      convertedClientId: clientId,
      convertedProjectId: projectId,
      convertedContractId: contract.id,
      convertedAt,
    },
  );
  if (!updated) throw new NotFoundError('Opportunity');

  await noteModuleUsage(context.db, context.organizationId, 'crm');
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.OPPORTUNITY_CONVERTED,
    entityType: 'crm_opportunity',
    entityId: updated.id,
    after: {
      clientId,
      projectId,
      contractId: contract.id,
      salesQuoteVersionId: acceptedVersion.id,
      netAmount,
      currency,
    },
  });

  return {
    opportunity: updated,
    clientId,
    projectId,
    contractId: contract.id,
  };
}
