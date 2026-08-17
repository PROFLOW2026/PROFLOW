/**
 * Generic accounting / connection foundation.
 * Schema forbids `connected`. This execution never pretends a live API exists.
 */

export const INTEGRATION_KINDS = ['accounting', 'calendar', 'email', 'assistant', 'other'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_STATUSES = ['unconfigured', 'disconnected', 'error'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_SYNC_DIRECTIONS = ['none', 'export', 'import', 'bidirectional'] as const;
export type IntegrationSyncDirection = (typeof INTEGRATION_SYNC_DIRECTIONS)[number];

export const ACCOUNTING_PROVIDER_KEYS = [
  'hashavshevet',
  'priority',
  'icount',
  'morning',
  'green_invoice',
  'quickbooks',
  'xero',
] as const;
export type AccountingProviderKey = (typeof ACCOUNTING_PROVIDER_KEYS)[number];

export interface AccountingCapabilities {
  readonly exportInvoices: boolean;
  readonly importPayments: boolean;
  readonly syncVendors: boolean;
  readonly syncClients: boolean;
  readonly issueStatutoryInvoice: boolean;
}

export const DISABLED_ACCOUNTING_CAPABILITIES: AccountingCapabilities = {
  exportInvoices: false,
  importPayments: false,
  syncVendors: false,
  syncClients: false,
  issueStatutoryInvoice: false,
};

export interface OrganizationIntegrationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly providerKey: string;
  readonly integrationKind: IntegrationKind;
  readonly status: IntegrationStatus;
  readonly capabilities: AccountingCapabilities;
  readonly syncDirection: IntegrationSyncDirection;
  readonly lastError: string | null;
}

export interface IntegrationCatalogEntry {
  readonly providerKey: AccountingProviderKey;
  readonly integrationKind: 'accounting';
  readonly status: IntegrationStatus;
  readonly capabilities: AccountingCapabilities;
  readonly configured: boolean;
  readonly connected: false;
  readonly messageKey: string;
}

export const INTEGRATION_ENTITY_TYPES = [
  'client',
  'vendor',
  'billing_record',
  'ap_bill',
  /** AR receipt. Same local table as `ar_payment`. */
  'payment',
  'ar_payment',
  'ap_payment',
  'project',
] as const;
export type IntegrationEntityType = (typeof INTEGRATION_ENTITY_TYPES)[number];

export interface IntegrationEntityMappingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly integrationId: string;
  readonly entityType: IntegrationEntityType | string;
  readonly entityId: string;
  readonly externalId: string;
  readonly externalNumber: string | null;
}

export interface IntegrationSyncJobRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly integrationId: string;
  readonly jobKind: string;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly errorMessage: string | null;
}
