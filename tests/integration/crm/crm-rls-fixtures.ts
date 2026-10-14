import { randomUUID } from 'node:crypto';
import {
  crmEstimates,
  crmLeads,
  crmOpportunities,
  crmOpportunityNotes,
  crmProspectContacts,
  crmProspects,
  crmSalesQuoteLines,
  crmSalesQuotes,
  crmSalesQuoteVersions,
} from '@drizzle/schema';
import type { TestDatabase } from '@tests/setup/database';

/** Nine CRM tables covered by prepared 0184. */
export const CRM_RLS_TABLES = [
  'crm_prospects',
  'crm_prospect_contacts',
  'crm_leads',
  'crm_opportunities',
  'crm_opportunity_notes',
  'crm_estimates',
  'crm_sales_quotes',
  'crm_sales_quote_versions',
  'crm_sales_quote_lines',
] as const;

export interface CrmRlsSeed {
  readonly organizationId: string;
  readonly opportunityId: string;
}

export async function seedCrmGraph(database: TestDatabase, organizationId: string): Promise<CrmRlsSeed> {
  const prospectId = randomUUID();
  const contactId = randomUUID();
  const leadId = randomUUID();
  const opportunityId = randomUUID();
  const noteId = randomUUID();
  const estimateId = randomUUID();
  const quoteId = randomUUID();
  const versionId = randomUUID();
  const lineId = randomUUID();

  await database.asService(async (db) => {
    await db.insert(crmProspects).values({
      id: prospectId,
      organizationId,
      name: 'RLS Prospect',
    });
    await db.insert(crmProspectContacts).values({
      id: contactId,
      organizationId,
      prospectId,
      name: 'Contact',
    });
    await db.insert(crmLeads).values({
      id: leadId,
      organizationId,
      prospectId,
      title: 'Inbound lead',
    });
    await db.insert(crmOpportunities).values({
      id: opportunityId,
      organizationId,
      prospectId,
      leadId,
      name: 'RLS Opportunity',
      currency: 'ILS',
    });
    await db.insert(crmOpportunityNotes).values({
      id: noteId,
      organizationId,
      opportunityId,
      body: 'Sensitive note',
    });
    await db.insert(crmEstimates).values({
      id: estimateId,
      organizationId,
      opportunityId,
      name: 'Internal estimate',
      currency: 'ILS',
    });
    await db.insert(crmSalesQuotes).values({
      id: quoteId,
      organizationId,
      opportunityId,
      title: 'Customer quote',
      currency: 'ILS',
    });
    await db.insert(crmSalesQuoteVersions).values({
      id: versionId,
      organizationId,
      salesQuoteId: quoteId,
      versionNumber: 1,
      subtotalAmount: '1000',
      totalAmount: '1000',
      currency: 'ILS',
    });
    await db.insert(crmSalesQuoteLines).values({
      id: lineId,
      organizationId,
      versionId,
      description: 'Line',
      unitAmount: '1000',
      lineTotal: '1000',
      currency: 'ILS',
    });
  });

  return { organizationId, opportunityId };
}
