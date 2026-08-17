import type { AccountingCapabilities, AccountingProviderKey, IntegrationStatus } from './types';

export type AccountingAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errorCode: 'not_configured' | 'unsupported'; readonly message: string };

export interface AccountingAdapterStatus {
  readonly providerKey: AccountingProviderKey | 'unconfigured';
  readonly configured: boolean;
  readonly connected: false;
  readonly status: IntegrationStatus;
  readonly capabilities: AccountingCapabilities;
  readonly messageKey: string;
}

export interface AccountingAdapter {
  readonly id: string;
  isConfigured(): boolean;
  getStatus(): AccountingAdapterStatus;
  discoverCapabilities(): AccountingCapabilities;
  testConnection(): Promise<AccountingAdapterResult<{ connected: false }>>;
  exportInvoice(): Promise<AccountingAdapterResult<never>>;
  importPayments(): Promise<AccountingAdapterResult<never>>;
}
