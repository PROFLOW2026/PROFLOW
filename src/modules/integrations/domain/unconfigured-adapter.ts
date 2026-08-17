import type { AccountingAdapter, AccountingAdapterResult, AccountingAdapterStatus } from './adapter';
import { unconfiguredCapabilities } from './status-guard';
import { DISABLED_ACCOUNTING_CAPABILITIES, type AccountingCapabilities } from './types';

function notConfigured<T>(): AccountingAdapterResult<T> {
  return {
    ok: false,
    errorCode: 'not_configured',
    message: 'Accounting provider is not configured',
  };
}

/**
 * Default adapter. Never issues statutory invoices and never reports connected.
 */
export class UnconfiguredAccountingAdapter implements AccountingAdapter {
  readonly id = 'unconfigured';

  isConfigured(): boolean {
    return false;
  }

  getStatus(): AccountingAdapterStatus {
    return {
      providerKey: 'unconfigured',
      configured: false,
      connected: false,
      status: 'unconfigured',
      capabilities: unconfiguredCapabilities(),
      messageKey: 'integrations.empty.body',
    };
  }

  discoverCapabilities(): AccountingCapabilities {
    return { ...DISABLED_ACCOUNTING_CAPABILITIES };
  }

  async testConnection(): Promise<AccountingAdapterResult<{ connected: false }>> {
    return notConfigured();
  }

  async exportInvoice(): Promise<AccountingAdapterResult<never>> {
    return notConfigured();
  }

  async importPayments(): Promise<AccountingAdapterResult<never>> {
    return notConfigured();
  }
}

let defaultAdapter: AccountingAdapter | null = null;

export function getAccountingAdapter(): AccountingAdapter {
  if (!defaultAdapter) defaultAdapter = new UnconfiguredAccountingAdapter();
  return defaultAdapter;
}

export function setAccountingAdapterForTests(adapter: AccountingAdapter | null): void {
  defaultAdapter = adapter;
}
