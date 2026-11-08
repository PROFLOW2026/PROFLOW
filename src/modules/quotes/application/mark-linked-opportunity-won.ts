import { and, eq, sql } from 'drizzle-orm';
import { contracts } from '@drizzle/schema';
import { copyProspectContactsOntoClient } from '@/modules/crm/application/copy-prospect-contacts-to-client';
import {
  findLeadById,
  findOpportunityById,
  findProspectById,
  updateLeadById,
  updateOpportunityById,
  updateProspectById,
} from '@/modules/crm/lookups';
import type { OrgContext } from '@/shared/auth/context';
import { assertAllPermissions } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { QuoteRecord } from '../domain/types';

const QUOTE_CONVERT_PERMISSIONS = [
  PERMISSIONS.QUOTES_MANAGE,
  PERMISSIONS.PROJECTS_CREATE,
  PERMISSIONS.PROJECTS_UPDATE,
  PERMISSIONS.CONTRACTS_MANAGE,
] as const;

/**
 * Marks the one opportunity linked to this converted quote as won.
 * The quote-convert permission set is asserted again here, before any write.
 * The user-role update is limited to that opportunity id in this organization.
 * When crm_opportunities_tenant_update hides the row, the same one-row write
 * goes through app.mark_linked_opportunity_won (see mark-linked-opportunity-won.sql-snippet.txt).
 */
export async function markLinkedOpportunityWon(
  context: OrgContext,
  input: {
    readonly quote: QuoteRecord;
    readonly projectId: string;
    readonly clientId: string | null;
  },
): Promise<void> {
  assertAllPermissions(context, QUOTE_CONVERT_PERMISSIONS);
  if (!input.quote.opportunityId) return;

  const opportunityId = input.quote.opportunityId;
  const opportunity = await findOpportunityById(context.db, context.organizationId, opportunityId);
  if (opportunity && opportunity.id !== opportunityId) return;
  if (opportunity && (opportunity.status === 'lost' || opportunity.status === 'cancelled')) return;
  if (opportunity?.convertedProjectId && opportunity.convertedProjectId !== input.projectId) return;

  let contractId: string | null = opportunity?.convertedContractId ?? null;
  const [contract] = await context.db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(eq(contracts.projectId, input.projectId), eq(contracts.organizationId, context.organizationId)),
    )
    .limit(1);
  if (contract) contractId = contract.id;

  const clientId = input.clientId ?? opportunity?.convertedClientId ?? null;
  const convertedAt = opportunity?.convertedAt ?? new Date();

  if (opportunity?.prospectId && clientId) {
    await copyProspectContactsOntoClient(context, {
      prospectId: opportunity.prospectId,
      clientId,
    });
  }

  if (opportunity?.prospectId) {
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

  if (opportunity?.leadId) {
    const lead = await findLeadById(context.db, context.organizationId, opportunity.leadId);
    if (lead && lead.status !== 'converted') {
      await updateLeadById(context.db, context.organizationId, lead.id, {
        status: 'converted',
      });
    }
  }

  if (opportunity) {
    const updated = await updateOpportunityById(context.db, context.organizationId, opportunity.id, {
      status: 'won',
      stage: 'won',
      convertedClientId: clientId,
      convertedProjectId: input.projectId,
      convertedContractId: contractId,
      convertedAt,
    });
    if (updated) return;
  }

  await context.db.execute(sql`
    SELECT app.mark_linked_opportunity_won(
      ${context.organizationId}::uuid,
      ${input.quote.id}::uuid,
      ${opportunityId}::uuid,
      ${input.projectId}::uuid,
      ${clientId}::uuid,
      ${contractId}::uuid,
      ${convertedAt}::timestamptz
    )
  `);
}
