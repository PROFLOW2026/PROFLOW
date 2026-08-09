import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findLeadById,
  findOpportunityById,
  findProspectById,
  insertOpportunity,
  insertOpportunityNote,
  listEstimatesForOpportunity,
  listOpportunities,
  listOpportunityNotes,
  listSalesQuoteLines,
  listSalesQuotesForOpportunity,
  listSalesQuoteVersions,
  updateOpportunityById,
} from '../data/crm.repository';
import {
  CRM_AUDIT_ACTIONS,
  type OpportunityDetail,
  type OpportunityNoteRecord,
  type OpportunityRecord,
} from '../domain/types';
import {
  createOpportunityNoteSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  type CreateOpportunityInput,
  type CreateOpportunityNoteInput,
  type UpdateOpportunityInput,
} from '../validation/schemas';

export async function listOpportunitiesForOrg(
  context: OrgContext,
  filters: {
    search?: string;
    status?: OpportunityRecord['status'] | 'all';
    stage?: OpportunityRecord['stage'] | 'all';
    includeArchived?: boolean;
  } = {},
): Promise<OpportunityRecord[]> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  return listOpportunities(context.db, context.organizationId, filters);
}

export async function getOpportunityById(
  context: OrgContext,
  opportunityId: string,
): Promise<OpportunityDetail> {
  assertPermission(context, PERMISSIONS.CRM_READ);

  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    opportunityId,
  );
  if (!opportunity) throw new NotFoundError('Opportunity');

  const prospect = opportunity.prospectId
    ? await findProspectById(context.db, context.organizationId, opportunity.prospectId)
    : null;

  const notes = await listOpportunityNotes(context.db, context.organizationId, opportunityId);
  const estimates = await listEstimatesForOpportunity(
    context.db,
    context.organizationId,
    opportunityId,
  );
  const quotes = await listSalesQuotesForOpportunity(
    context.db,
    context.organizationId,
    opportunityId,
  );

  const salesQuotes = [];
  for (const quote of quotes) {
    const versions = await listSalesQuoteVersions(context.db, context.organizationId, quote.id);
    const versionsWithLines = [];
    for (const version of versions) {
      const lines = await listSalesQuoteLines(context.db, context.organizationId, version.id);
      versionsWithLines.push({ ...version, lines });
    }
    salesQuotes.push({ ...quote, versions: versionsWithLines });
  }

  return {
    ...opportunity,
    opportunityNotes: opportunity.notes,
    prospect,
    notes,
    estimates,
    salesQuotes,
  };
}

export async function createOpportunity(
  context: OrgContext,
  rawInput: CreateOpportunityInput,
): Promise<OpportunityRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createOpportunitySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.prospectId) {
    const prospect = await findProspectById(context.db, context.organizationId, input.prospectId);
    if (!prospect) throw new NotFoundError('Prospect');
  }
  if (input.leadId) {
    const lead = await findLeadById(context.db, context.organizationId, input.leadId);
    if (!lead) throw new NotFoundError('Lead');
  }

  const opportunity = await insertOpportunity(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    prospectId: input.prospectId ?? null,
    leadId: input.leadId ?? null,
    stage: input.stage,
    expectedValueAmount: input.expectedValueAmount ?? null,
    currency: input.currency?.toUpperCase() ?? null,
    expectedStartDate: input.expectedStartDate ?? null,
    referralSource: input.referralSource ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.OPPORTUNITY_CREATED,
    entityType: 'crm_opportunity',
    entityId: opportunity.id,
    after: opportunity,
  });

  return opportunity;
}

export async function updateOpportunity(
  context: OrgContext,
  rawInput: UpdateOpportunityInput,
): Promise<OpportunityRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = updateOpportunitySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
  );
  if (!existing) throw new NotFoundError('Opportunity');

  if (existing.status === 'won' && existing.convertedAt) {
    // Converted opportunities stay historical; allow notes/lostReason tweaks only via status guards elsewhere.
  }

  const updated = await updateOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
    {
      name: input.name,
      prospectId: input.prospectId === undefined ? undefined : input.prospectId,
      leadId: input.leadId === undefined ? undefined : input.leadId,
      stage: input.stage,
      status: input.status,
      expectedValueAmount:
        input.expectedValueAmount === undefined ? undefined : input.expectedValueAmount,
      currency: input.currency === undefined ? undefined : input.currency?.toUpperCase() ?? null,
      expectedStartDate: input.expectedStartDate === undefined ? undefined : input.expectedStartDate,
      referralSource: input.referralSource === undefined ? undefined : input.referralSource,
      lostReason: input.lostReason === undefined ? undefined : input.lostReason,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  );
  if (!updated) throw new NotFoundError('Opportunity');

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return updated;
}

export async function createOpportunityNote(
  context: OrgContext,
  rawInput: CreateOpportunityNoteInput,
): Promise<OpportunityNoteRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createOpportunityNoteSchema.safeParse(rawInput);
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

  const note = await insertOpportunityNote(context.db, {
    organizationId: context.organizationId,
    opportunityId: input.opportunityId,
    body: input.body,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return note;
}
