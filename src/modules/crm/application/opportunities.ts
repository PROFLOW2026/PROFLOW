import { noteModuleUsage } from '@/modules/tenancy';
import { listAuditEventSummariesForEntity, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findLeadById,
  findOpportunityById,
  findProspectById,
  insertOpportunity,
  insertOpportunityNote,
  listEstimatesForOpportunity,
  listOpportunities,
  listOpportunityNotes,
  listSalesQuoteLinesForVersions,
  listSalesQuotesForOpportunity,
  listSalesQuoteVersionsForQuotes,
  updateLeadById,
  updateOpportunityById,
} from '../data/crm.repository';
import { listQuotes } from '@/modules/quotes/lookups';
import { assertLostCreatesNoProject } from '../domain/conversion';
import { statusForMovedStage } from '../domain/pipeline-board';
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
  const productQuotes = await listQuotes(context.db, context.organizationId, {
    opportunityId,
  });
  const quotes = await listSalesQuotesForOpportunity(
    context.db,
    context.organizationId,
    opportunityId,
  );

  const allVersions = await listSalesQuoteVersionsForQuotes(
    context.db,
    context.organizationId,
    quotes.map((quote) => quote.id),
  );
  const allLines = await listSalesQuoteLinesForVersions(
    context.db,
    context.organizationId,
    allVersions.map((version) => version.id),
  );

  const versionsByQuote = new Map<string, typeof allVersions>();
  for (const version of allVersions) {
    const bucket = versionsByQuote.get(version.salesQuoteId) ?? [];
    bucket.push(version);
    versionsByQuote.set(version.salesQuoteId, bucket);
  }
  const linesByVersion = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const bucket = linesByVersion.get(line.versionId) ?? [];
    bucket.push(line);
    linesByVersion.set(line.versionId, bucket);
  }

  const salesQuotes = quotes.map((quote) => {
    const versions = versionsByQuote.get(quote.id) ?? [];
    return {
      ...quote,
      versions: versions.map((version) => ({
        ...version,
        lines: linesByVersion.get(version.id) ?? [],
      })),
    };
  });

  const auditEvents = await listAuditEventSummariesForEntity(context, {
    entityType: 'crm_opportunity',
    entityId: opportunityId,
    limit: 50,
  });

  return {
    ...opportunity,
    opportunityNotes: opportunity.notes,
    prospect,
    notes,
    estimates,
    productQuotes,
    auditEvents,
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
    nextActionAt: input.nextActionAt ?? null,
    nextActionText: input.nextActionText ?? null,
  });

  // Lead → opportunity is the conversion step; mark the lead so lists stay coherent.
  if (input.leadId) {
    const lead = await findLeadById(context.db, context.organizationId, input.leadId);
    if (lead && lead.status !== 'converted' && lead.status !== 'disqualified') {
      await updateLeadById(context.db, context.organizationId, lead.id, {
        status: 'converted',
      });
    }
  }

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

  const markingLost = input.status === 'lost' || input.stage === 'lost';
  if (markingLost) {
    assertLostCreatesNoProject(existing);
  }

  if (existing.status === 'won' && existing.convertedAt) {
    // Converted opportunities stay historical; allow notes/lostReason tweaks only via status guards elsewhere.
  }

  const statusFromStage =
    input.stage && input.status === undefined
      ? statusForMovedStage(input.stage, existing.status)
      : undefined;

  const updated = await updateOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
    {
      name: input.name,
      prospectId: input.prospectId === undefined ? undefined : input.prospectId,
      leadId: input.leadId === undefined ? undefined : input.leadId,
      stage: input.stage,
      status: input.status ?? statusFromStage,
      expectedValueAmount:
        input.expectedValueAmount === undefined ? undefined : input.expectedValueAmount,
      currency: input.currency === undefined ? undefined : input.currency?.toUpperCase() ?? null,
      expectedStartDate: input.expectedStartDate === undefined ? undefined : input.expectedStartDate,
      referralSource: input.referralSource === undefined ? undefined : input.referralSource,
      lostReason: input.lostReason === undefined ? undefined : input.lostReason,
      notes: input.notes === undefined ? undefined : input.notes,
      nextActionAt: input.nextActionAt === undefined ? undefined : input.nextActionAt,
      nextActionText: input.nextActionText === undefined ? undefined : input.nextActionText,
    },
  );
  if (!updated) throw new NotFoundError('Opportunity');

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  const stageChanged = Boolean(input.stage && input.stage !== existing.stage);
  if (markingLost && existing.status !== 'lost') {
    await recordAuditEvent(context, {
      action: CRM_AUDIT_ACTIONS.OPPORTUNITY_UPDATED,
      entityType: 'crm_opportunity',
      entityId: updated.id,
      before: { status: existing.status, stage: existing.stage },
      after: {
        status: updated.status,
        stage: updated.stage,
        lostReason: updated.lostReason,
        convertedProjectId: null,
        noProjectCreated: true,
      },
    });
  } else if (stageChanged) {
    await recordAuditEvent(context, {
      action: CRM_AUDIT_ACTIONS.OPPORTUNITY_UPDATED,
      entityType: 'crm_opportunity',
      entityId: updated.id,
      before: { status: existing.status, stage: existing.stage },
      after: { status: updated.status, stage: updated.stage },
    });
  }

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
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.OPPORTUNITY_NOTE_CREATED,
    entityType: 'crm_opportunity',
    entityId: opportunity.id,
    after: { noteId: note.id },
  });

  return note;
}
