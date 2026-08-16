/**
 * Extension point for a future live bank feed.
 *
 * V1 must not claim live connectivity. Implementations may exist as stubs only
 * until credentials + product approval land.
 */

export type BankFeedErrorCode =
  | 'not_configured'
  | 'not_implemented'
  | 'provider_error';

export interface BankFeedAccountRef {
  readonly externalAccountId: string;
  readonly name: string;
  readonly currency: string;
  readonly accountMask: string | null;
}

export interface BankFeedTransactionRef {
  readonly externalTxnId: string;
  readonly date: string;
  readonly valueDate: string | null;
  readonly description: string;
  readonly amount: string;
  readonly direction: 'credit' | 'debit';
  readonly reference: string | null;
}

export interface BankFeedProvider {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  listAccounts(input: {
    organizationId: string;
  }): Promise<
    | { ok: true; accounts: readonly BankFeedAccountRef[] }
    | { ok: false; errorCode: BankFeedErrorCode; message: string }
  >;
  fetchTransactions(input: {
    organizationId: string;
    externalAccountId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<
    | { ok: true; transactions: readonly BankFeedTransactionRef[] }
    | { ok: false; errorCode: BankFeedErrorCode; message: string }
  >;
}

/**
 * Stub live feed - always reports not configured.
 * Does not invent balances or transactions.
 */
export class StubBankFeedProvider implements BankFeedProvider {
  readonly id = 'stub-live-feed';
  readonly displayName = 'Live bank feed (not configured)';

  isConfigured(): boolean {
    return false;
  }

  async listAccounts(): Promise<
    | { ok: true; accounts: readonly BankFeedAccountRef[] }
    | { ok: false; errorCode: BankFeedErrorCode; message: string }
  > {
    return {
      ok: false,
      errorCode: 'not_configured',
      message: 'Live bank feed is not configured for this organization',
    };
  }

  async fetchTransactions(): Promise<
    | { ok: true; transactions: readonly BankFeedTransactionRef[] }
    | { ok: false; errorCode: BankFeedErrorCode; message: string }
  > {
    return {
      ok: false,
      errorCode: 'not_configured',
      message: 'Live bank feed is not configured for this organization',
    };
  }
}

let activeFeedProvider: BankFeedProvider = new StubBankFeedProvider();

export function getBankFeedProvider(): BankFeedProvider {
  return activeFeedProvider;
}

export function setBankFeedProviderForTests(provider: BankFeedProvider | null): void {
  activeFeedProvider = provider ?? new StubBankFeedProvider();
}
