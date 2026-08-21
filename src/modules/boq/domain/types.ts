/**
 * BOQ domain types - framework-free.
 * BOQ Progress ≠ Actual. See docs/boq/LEAD-ARCHITECTURE-CONTRACT.md.
 */

import { AUDIT_ACTIONS } from '@/shared/audit/actions';

export const BOQ_STATUSES = ['draft', 'active', 'superseded', 'archived'] as const;
export type BoqStatus = (typeof BOQ_STATUSES)[number];

export const BOQ_PROGRESS_MODES = ['simple', 'advanced'] as const;
export type BoqProgressMode = (typeof BOQ_PROGRESS_MODES)[number];

export const BOQ_NODE_KINDS = ['chapter', 'item'] as const;
export type BoqNodeKind = (typeof BOQ_NODE_KINDS)[number];

export const BOQ_PRICING_TYPES = ['quantity_unit_price', 'lump_sum'] as const;
export type BoqPricingType = (typeof BOQ_PRICING_TYPES)[number];

export const BOQ_NODE_STATUSES = ['active', 'cancelled', 'archived'] as const;
export type BoqNodeStatus = (typeof BOQ_NODE_STATUSES)[number];

export const BOQ_ALLOCATION_KINDS = [
  'quantity_change',
  'unit_price_change',
  'new_item',
  'unallocated_contract',
  'lump_sum',
  'reversal',
  'correction',
] as const;
export type BoqAllocationKind = (typeof BOQ_ALLOCATION_KINDS)[number];

/** User-facing allocate form only — system kinds (reversal/correction) stay RPC/system. */
export const BOQ_USER_ALLOCATION_KINDS = [
  'quantity_change',
  'unit_price_change',
  'new_item',
  'unallocated_contract',
  'lump_sum',
] as const;
export type BoqUserAllocationKind = (typeof BOQ_USER_ALLOCATION_KINDS)[number];

export const BOQ_BATCH_STATUSES = ['draft', 'approved', 'billed', 'superseded', 'voided'] as const;
export type BoqBatchStatus = (typeof BOQ_BATCH_STATUSES)[number];

export const BOQ_SUB_SCHEDULE_STATUSES = ['draft', 'active', 'archived'] as const;
export type BoqSubScheduleStatus = (typeof BOQ_SUB_SCHEDULE_STATUSES)[number];

export const BOQ_SUB_VALUATION_STATUSES = ['draft', 'approved', 'proposed_ap', 'voided'] as const;
export type BoqSubValuationStatus = (typeof BOQ_SUB_VALUATION_STATUSES)[number];

export const CONTRACT_BOQ_RECON_STATUSES = [
  'matched',
  'variance',
  'unallocated_contract_value',
  'unallocated_approved_change',
] as const;
export type ContractBoqReconStatus = (typeof CONTRACT_BOQ_RECON_STATUSES)[number];

/** Suggested units - not a closed DB enum; custom text allowed. */
export const BOQ_SUGGESTED_UNITS = [
  "יח'",
  'מ\'',
  'מ"א',
  'מ"ר',
  'מ"ק',
  'ק"ג',
  'טון',
  'שעה',
  'יום',
  'קומפלט',
  'LS',
  '%',
  'ea',
  'm',
  'm2',
  'm3',
  'kg',
  'ton',
  'hr',
  'day',
] as const;

export const BOQ_AUDIT_ACTIONS = {
  BOQ_CREATED: AUDIT_ACTIONS.BOQ_CREATED,
  BOQ_UPDATED: AUDIT_ACTIONS.BOQ_UPDATED,
  BOQ_ACTIVATED: AUDIT_ACTIONS.BOQ_ACTIVATED,
  BOQ_SUPERSEDED: AUDIT_ACTIONS.BOQ_SUPERSEDED,
  BOQ_ARCHIVED: AUDIT_ACTIONS.BOQ_ARCHIVED,
  BOQ_NODE_CREATED: AUDIT_ACTIONS.BOQ_NODE_CREATED,
  BOQ_NODE_UPDATED: AUDIT_ACTIONS.BOQ_NODE_UPDATED,
  BOQ_NODE_ARCHIVED: AUDIT_ACTIONS.BOQ_NODE_ARCHIVED,
  BOQ_IMPORTED: AUDIT_ACTIONS.BOQ_IMPORTED,
  BOQ_CHANGE_ALLOCATED: AUDIT_ACTIONS.BOQ_CHANGE_ALLOCATED,
  BOQ_PROGRESS_CREATED: AUDIT_ACTIONS.BOQ_PROGRESS_CREATED,
  BOQ_PROGRESS_UPDATED: AUDIT_ACTIONS.BOQ_PROGRESS_UPDATED,
  BOQ_PROGRESS_APPROVED: AUDIT_ACTIONS.BOQ_PROGRESS_APPROVED,
  BOQ_PROGRESS_SUPERSEDED: AUDIT_ACTIONS.BOQ_PROGRESS_SUPERSEDED,
  BOQ_PROGRESS_BILLING_CREATED: AUDIT_ACTIONS.BOQ_PROGRESS_BILLING_CREATED,
  BOQ_SUB_SCHEDULE_CREATED: AUDIT_ACTIONS.BOQ_SUB_SCHEDULE_CREATED,
  BOQ_SUB_SCHEDULE_ACTIVATED: AUDIT_ACTIONS.BOQ_SUB_SCHEDULE_ACTIVATED,
  BOQ_SUB_VALUATION_CREATED: AUDIT_ACTIONS.BOQ_SUB_VALUATION_CREATED,
  BOQ_SUB_VALUATION_APPROVED: AUDIT_ACTIONS.BOQ_SUB_VALUATION_APPROVED,
  BOQ_SUB_VALUATION_PROPOSED_AP: AUDIT_ACTIONS.BOQ_SUB_VALUATION_PROPOSED_AP,
  BOQ_SUB_VALUATION_VOIDED: AUDIT_ACTIONS.BOQ_SUB_VALUATION_VOIDED,
} as const;
