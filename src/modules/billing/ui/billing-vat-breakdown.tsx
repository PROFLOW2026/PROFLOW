import { MoneyText } from '@/components/patterns/money-text';
import { zeroMoney, type MoneyValue } from '@/shared/money';

/**
 * NET / VAT / GROSS breakdown for a billing record (authority for tax composition).
 * Owner presentation: NET primary, GROSS secondary.
 */
export function BillingVatBreakdown({
  subtotalAmount,
  taxAmount,
  totalAmount,
  labels,
  className,
}: {
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null | undefined;
  readonly totalAmount: MoneyValue;
  readonly labels: {
    readonly net: string;
    readonly tax: string;
    readonly gross: string;
    readonly includingVat?: string;
  };
  readonly className?: string;
}) {
  const tax = taxAmount ?? zeroMoney(totalAmount.currency);
  const grossLabel = labels.includingVat ?? labels.gross;

  return (
    <div className={className ?? 'flex min-w-0 flex-col gap-3'}>
      <div>
        <p className="text-2xl font-semibold tabular-nums">
          <MoneyText value={subtotalAmount} />
        </p>
        <p className="text-xs text-[var(--pf-text-muted)]">{labels.net}</p>
        <p className="text-xs text-[var(--pf-text-muted)] tabular-nums">
          ({grossLabel}: <MoneyText value={totalAmount} className="inline font-medium" />)
        </p>
      </div>
      <dl className="grid gap-2 border-t border-[var(--pf-border-default)] pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{labels.tax}</dt>
          <dd className="font-medium">
            <MoneyText value={tax} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{labels.gross}</dt>
          <dd className="font-medium">
            <MoneyText value={totalAmount} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
