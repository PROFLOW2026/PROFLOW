import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Canonical status vocabularies. Values are the English canonical keys from the
 * product docs; Hebrew labels live in the locale catalogs, never in the database.
 */

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'invited', 'suspended']);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

/** Doc 59 §3 — project statuses (U4). */
export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
]);

export const clientStatusEnum = pgEnum('client_status', ['active', 'inactive']);

export const contractStatusEnum = pgEnum('contract_status', ['draft', 'active', 'closed', 'cancelled']);

/**
 * Doc 59 §3 (U7). `Sent` is deliberately absent: sending is an event recorded
 * on `sent_at`, not a lifecycle status.
 */
export const changeStatusEnum = pgEnum('change_status', [
  'draft',
  'awaiting_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const changeDirectionEnum = pgEnum('change_direction', ['addition', 'reduction']);

export const quoteVersionStatusEnum = pgEnum('quote_version_status', [
  'draft',
  'issued',
  'superseded',
  'accepted',
  'rejected',
]);

export const approvalDecisionEnum = pgEnum('approval_decision', ['approved', 'rejected']);

/** Doc 16 §5.4 — the four V1 cost families. */
export const costFamilyEnum = pgEnum('cost_family', [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
]);

export const expenseStatusEnum = pgEnum('expense_status', ['draft', 'finalized', 'void']);

export const allocationTargetEnum = pgEnum('allocation_target', ['project', 'overhead']);

export const allocationMethodEnum = pgEnum('allocation_method', [
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
]);

/** Snapshot lifecycle for automatic allocation runs (Wave 2). */
export const allocationRunStatusEnum = pgEnum('allocation_run_status', [
  'draft',
  'applied',
  'superseded',
]);

/**
 * How source NET is split into period slices before weight allocation (Wave 3).
 * Independent of expense invoice recurrence.
 */
export const allocationScheduleModeEnum = pgEnum('allocation_schedule_mode', [
  'one_time',
  'monthly',
  'annual',
  'custom',
]);

export const vendorTypeEnum = pgEnum('vendor_type', ['supplier', 'subcontractor', 'both', 'other']);

export const vendorStatusEnum = pgEnum('vendor_status', ['active', 'inactive']);

export const employeeStatusEnum = pgEnum('employee_status', ['active', 'inactive']);

export const rateUnitEnum = pgEnum('rate_unit', ['hourly', 'daily', 'monthly']);

export const laborComponentBasisEnum = pgEnum('labor_component_basis', ['amount', 'percent']);

export const timeEntryKindEnum = pgEnum('time_entry_kind', ['project', 'non_project']);

/** Doc 65 D5 — finalized records are voided/adjusted, never silently rewritten. */
export const billingStatusEnum = pgEnum('billing_status', ['draft', 'finalized', 'void']);

export const billingKindEnum = pgEnum('billing_kind', ['invoice', 'credit_note', 'advance', 'retention_release']);

export const paymentStatusEnum = pgEnum('payment_status', ['recorded', 'void']);

export const documentStatusEnum = pgEnum('document_status', ['pending', 'available', 'deleted']);

export const documentOwnerTypeEnum = pgEnum('document_owner_type', [
  'project',
  'client',
  'vendor',
  'expense',
  'change_request',
  'change_order',
  'approval',
  'billing_record',
  'quote_version',
  'employee',
  'organization',
  'procurement_rfq',
  'purchase_order',
  'ap_bill',
  'daily_log',
  'punch_list_item',
  'inspection',
  'compliance_artifact',
  'asset',
  'inventory_item',
  'form_submission',
  'contract',
  'work_order',
  'subcontract_agreement',
  'safety_record',
  'timesheet',
]);

export const taxMethodEnum = pgEnum('tax_method', ['percentage', 'exempt', 'zero_rated']);

export const contactRoleEnum = pgEnum('contact_role', ['primary', 'billing', 'site', 'other']);

export const identifierTypeEnum = pgEnum('identifier_type', [
  'tax_id',
  'company_number',
  'vat_number',
  'license_number',
  'other',
]);
