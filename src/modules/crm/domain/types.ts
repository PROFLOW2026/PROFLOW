/**
 * CRM / pre-project lifecycle (doc 20).
 * Opportunity is not a Project — conversion is an explicit action.
 */

import { AUDIT_ACTIONS } from '@/shared/audit/actions';

export const PROSPECT_STATUSES = ['active', 'converted', 'inactive'] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'disqualified', 'converted'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const OPPORTUNITY_STAGES = [
  'qualify',
  'estimate',
  'quote',
  'negotiation',
  'won',
  'lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STATUSES = ['open', 'won', 'lost', 'cancelled'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const ESTIMATE_STATUSES = ['draft', 'final', 'superseded'] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const SALES_QUOTE_STATUSES = ['draft', 'issued', 'accepted', 'rejected', 'cancelled'] as const;
export type SalesQuoteStatus = (typeof SALES_QUOTE_STATUSES)[number];

export const SALES_QUOTE_VERSION_STATUSES = [
  'draft',
  'issued',
  'superseded',
  'accepted',
  'rejected',
] as const;
export type SalesQuoteVersionStatus = (typeof SALES_QUOTE_VERSION_STATUSES)[number];

export interface ProspectRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: ProspectStatus;
  readonly email: string | null;
  readonly phone: string | null;
  readonly companyName: string | null;
  readonly notes: string | null;
  readonly convertedClientId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProspectContactRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly prospectId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LeadRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly prospectId: string | null;
  readonly title: string;
  readonly source: string | null;
  readonly status: LeadStatus;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OpportunityRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly prospectId: string | null;
  readonly leadId: string | null;
  readonly name: string;
  readonly stage: OpportunityStage;
  readonly status: OpportunityStatus;
  readonly expectedValueAmount: string | null;
  readonly currency: string | null;
  readonly expectedStartDate: string | null;
  readonly referralSource: string | null;
  readonly lostReason: string | null;
  readonly convertedClientId: string | null;
  readonly convertedProjectId: string | null;
  readonly convertedContractId: string | null;
  readonly convertedAt: Date | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OpportunityNoteRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly body: string;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EstimateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly name: string;
  readonly status: EstimateStatus;
  readonly internalAmount: string | null;
  readonly currency: string;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SalesQuoteRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly title: string;
  readonly status: SalesQuoteStatus;
  readonly currency: string;
  readonly acceptedVersionId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SalesQuoteVersionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly salesQuoteId: string;
  readonly versionNumber: number;
  readonly status: SalesQuoteVersionStatus;
  readonly subtotalAmount: string;
  readonly taxAmount: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly alternateLabel: string | null;
  readonly notes: string | null;
  readonly issuedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SalesQuoteLineRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly versionId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitAmount: string;
  readonly lineTotal: string;
  readonly currency: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProspectListFilters {
  readonly search?: string;
  readonly status?: ProspectStatus | 'all';
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface LeadListFilters {
  readonly search?: string;
  readonly status?: LeadStatus | 'all';
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface OpportunityListFilters {
  readonly search?: string;
  readonly status?: OpportunityStatus | 'all';
  readonly stage?: OpportunityStage | 'all';
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface OpportunityDetail extends Omit<OpportunityRecord, 'notes'> {
  /** Free-text notes field from the opportunity row. */
  readonly opportunityNotes: string | null;
  readonly prospect: ProspectRecord | null;
  /** Activity / timeline notes. */
  readonly notes: readonly OpportunityNoteRecord[];
  readonly estimates: readonly EstimateRecord[];
  readonly salesQuotes: readonly (SalesQuoteRecord & {
    readonly versions: readonly (SalesQuoteVersionRecord & {
      readonly lines: readonly SalesQuoteLineRecord[];
    })[];
  })[];
}

/**
 * CRM audit keys aligned with Lead-owned `AUDIT_ACTIONS`.
 */
export const CRM_AUDIT_ACTIONS = {
  PROSPECT_CREATED: AUDIT_ACTIONS.CRM_PROSPECT_CREATED,
  PROSPECT_UPDATED: AUDIT_ACTIONS.CRM_PROSPECT_UPDATED,
  LEAD_CREATED: AUDIT_ACTIONS.CRM_LEAD_CREATED,
  LEAD_UPDATED: AUDIT_ACTIONS.CRM_LEAD_UPDATED,
  OPPORTUNITY_CREATED: AUDIT_ACTIONS.CRM_OPPORTUNITY_CREATED,
  OPPORTUNITY_UPDATED: AUDIT_ACTIONS.CRM_OPPORTUNITY_UPDATED,
  OPPORTUNITY_NOTE_CREATED: AUDIT_ACTIONS.CRM_OPPORTUNITY_NOTE_CREATED,
  OPPORTUNITY_CONVERTED: AUDIT_ACTIONS.CRM_OPPORTUNITY_CONVERTED,
  ESTIMATE_CREATED: AUDIT_ACTIONS.CRM_ESTIMATE_CREATED,
  ESTIMATE_UPDATED: AUDIT_ACTIONS.CRM_ESTIMATE_UPDATED,
  SALES_QUOTE_CREATED: AUDIT_ACTIONS.CRM_SALES_QUOTE_CREATED,
  SALES_QUOTE_VERSION_CREATED: AUDIT_ACTIONS.CRM_SALES_QUOTE_VERSION_CREATED,
  SALES_QUOTE_VERSION_ISSUED: AUDIT_ACTIONS.CRM_SALES_QUOTE_VERSION_ISSUED,
  SALES_QUOTE_VERSION_ACCEPTED: AUDIT_ACTIONS.CRM_QUOTE_ACCEPTED,
  QUOTE_ACCEPTED: AUDIT_ACTIONS.CRM_QUOTE_ACCEPTED,
} as const;

