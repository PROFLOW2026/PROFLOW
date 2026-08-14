/** Public API of the CRM / pre-project sales module (doc 20). */

export {
  listProspectsForOrg,
  getProspectById,
  createProspect,
  updateProspect,
  createProspectContact,
} from './application/prospects';

export {
  listLeadsForOrg,
  getLeadById,
  createLead,
  updateLead,
} from './application/leads';

export {
  listOpportunitiesForOrg,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  createOpportunityNote,
} from './application/opportunities';

export { createEstimate, updateEstimate } from './application/estimates';

export {
  createSalesQuote,
  createSalesQuoteVersion,
  issueSalesQuoteVersion,
  acceptSalesQuoteVersion,
} from './application/sales-quotes';

export { convertWonOpportunity } from './application/convert-won-opportunity';
export type { ConvertWonOpportunityResult } from './application/convert-won-opportunity';

export {
  canConvertOpportunity,
  assertCanConvertOpportunity,
  assertLostCreatesNoProject,
  assertQuoteBelongsToOpportunity,
  assertSalesQuoteIsNotBilling,
  isOpportunityAlreadyConverted,
  resolveCompletedConversion,
  contractNetAmountFromAcceptedQuote,
  contractEnteredAmountFromAcceptedQuote,
  isAcceptedSalesQuoteVersion,
  salesQuoteCreatesBillingRecord,
} from './domain/conversion';

export {
  isSalesQuoteVersionMutable,
  canIssueSalesQuoteVersion,
  canAcceptSalesQuoteVersion,
  shouldSupersedeOnNewVersion,
  salesQuoteStatusAfterAccept,
  salesQuoteStatusAfterIssue,
} from './domain/sales-quote-version-rules';

export {
  groupOpportunitiesByStage,
  isOpportunityStage,
  nextActionUrgency,
} from './domain/pipeline-board';
export type {
  OpportunityBoardCard,
  PipelineColumn,
  NextActionUrgency,
} from './domain/pipeline-board';

export {
  PROSPECT_STATUSES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STATUSES,
  ESTIMATE_STATUSES,
  SALES_QUOTE_STATUSES,
  SALES_QUOTE_VERSION_STATUSES,
  CRM_AUDIT_ACTIONS,
} from './domain/types';
export type {
  ProspectStatus,
  ProspectRecord,
  ProspectContactRecord,
  LeadStatus,
  LeadRecord,
  OpportunityStage,
  OpportunityStatus,
  OpportunityRecord,
  OpportunityNoteRecord,
  OpportunityDetail,
  EstimateStatus,
  EstimateRecord,
  SalesQuoteStatus,
  SalesQuoteRecord,
  SalesQuoteVersionStatus,
  SalesQuoteVersionRecord,
  SalesQuoteLineRecord,
} from './domain/types';

export {
  createProspectSchema,
  updateProspectSchema,
  createLeadSchema,
  updateLeadSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  createOpportunityNoteSchema,
  createEstimateSchema,
  updateEstimateSchema,
  createSalesQuoteSchema,
  createSalesQuoteVersionSchema,
  issueSalesQuoteVersionSchema,
  acceptSalesQuoteVersionSchema,
  convertWonOpportunitySchema,
} from './validation/schemas';
export type {
  CreateProspectInput,
  UpdateProspectInput,
  CreateLeadInput,
  UpdateLeadInput,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  CreateEstimateInput,
  CreateSalesQuoteInput,
  CreateSalesQuoteVersionInput,
  ConvertWonOpportunityInput,
} from './validation/schemas';
