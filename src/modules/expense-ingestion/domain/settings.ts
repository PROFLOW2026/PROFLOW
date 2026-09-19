import type { ExpenseIngestionProvider } from './types';

export const EXPENSE_INGESTION_PROVIDER_KEY = 'expense_ingestion_provider';

export interface OrgExpenseIngestionSettings {
  readonly provider: ExpenseIngestionProvider;
}

export const DEFAULT_ORG_EXPENSE_INGESTION_SETTINGS: OrgExpenseIngestionSettings = {
  provider: 'none',
};

export function parseExpenseIngestionProvider(value: unknown): ExpenseIngestionProvider {
  return value === 'sumit' ? 'sumit' : 'none';
}

export function isSumitExpenseIngestionEnabled(settings: OrgExpenseIngestionSettings): boolean {
  return settings.provider === 'sumit';
}
