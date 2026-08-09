/**
 * Keys that collide with canonical financial / commercial fields.
 * Custom fields must never replace these (doc 35 §4).
 */

export const RESERVED_CUSTOM_FIELD_KEYS = [
  'id',
  'organization_id',
  'organizationId',
  'amount',
  'currency',
  'contract_amount',
  'contractAmount',
  'original_amount',
  'originalAmount',
  'original_value',
  'originalValue',
  'current_value',
  'currentValue',
  'entered_value',
  'enteredValue',
  'cost',
  'costs',
  'true_cost',
  'trueCost',
  'labor_cost',
  'laborCost',
  'material_cost',
  'materialCost',
  'overhead',
  'overhead_allocation',
  'overheadAllocation',
  'profit',
  'margin',
  'margin_percent',
  'marginPercent',
  'rate',
  'rates',
  'burden_rate',
  'burdenRate',
  'hourly_rate',
  'hourlyRate',
  'cost_rate',
  'costRate',
  'invoiced',
  'paid',
  'outstanding',
  'tax',
  'tax_amount',
  'taxAmount',
  'tax_rate',
  'taxRate',
  'vat',
  'vat_amount',
  'vatAmount',
  'vat_rate',
  'vatRate',
  'retention',
  'billing_status',
  'billingStatus',
  'collection_status',
  'collectionStatus',
  'payment_status',
  'paymentStatus',
  'financial_status',
  'financialStatus',
  'project_status',
  'projectStatus',
  'change_status',
  'changeStatus',
  'status',
  'vendor_cost',
  'vendorCost',
  'subcontractor_cost',
  'subcontractorCost',
] as const;

const RESERVED_SET = new Set(RESERVED_CUSTOM_FIELD_KEYS.map((key) => key.toLowerCase()));

export function isReservedCustomFieldKey(key: string): boolean {
  return RESERVED_SET.has(key.trim().toLowerCase());
}

export function assertCustomFieldKeyAllowed(key: string): void {
  if (isReservedCustomFieldKey(key)) {
    throw new Error(`Custom field key is reserved: ${key}`);
  }
}
