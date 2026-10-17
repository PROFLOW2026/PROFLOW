import { formatMoneyString } from '@/shared/money/format';

export interface SearchHitAmountInput {
  readonly amount?: string | null;
  readonly grossAmount?: string | null;
  readonly currency?: string | null;
}

/**
 * Expense search hits carry net in `amount` and gross in `grossAmount`.
 * Other hits keep a single amount. Presentation only — stored values are not changed.
 */
export function formatSearchHitAmount(
  hit: SearchHitAmountInput,
  locale: string,
  labels: { readonly net: string; readonly gross: string },
): string | null {
  const currency = hit.currency?.trim() ? hit.currency : null;
  const net = hit.amount?.trim() ? hit.amount : null;
  const gross = hit.grossAmount?.trim() ? hit.grossAmount : null;
  if (net && gross && currency) {
    return `${labels.net} ${formatMoneyString(net, currency, locale)} · ${labels.gross} ${formatMoneyString(gross, currency, locale)}`;
  }
  if (net && currency) return formatMoneyString(net, currency, locale);
  return net;
}

/** Empty copy is only for a finished search. A changed query is loading until the request ends. */
export function showGlobalSearchEmpty(input: {
  readonly pending: boolean;
  readonly hasError: boolean;
  readonly trimmedLength: number;
  readonly rowCount: number;
}): boolean {
  return (
    !input.pending &&
    !input.hasError &&
    input.trimmedLength >= 2 &&
    input.rowCount === 0
  );
}
