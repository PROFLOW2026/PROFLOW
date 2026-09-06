import { MoneyText } from '@/components/patterns/money-text';
import { zeroMoney, type MoneyValue } from '@/shared/money';

/**
 * NET / VAT / GROSS breakdown for a billing record (authority for tax composition).
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
  };
  readonly className?: string;
}) {
  const tax = taxAmount ?? zeroMoney(totalAmount.currency);

  return (
    <dl className={className ?? 'grid gap-2 text-sm sm:grid-cols-3'}>
      <div>
        <dt className="text-xs text-[var(--pf-text-muted)]">{labels.net}</dt>
        <dd className="font-medium">
          <MoneyText value={subtotalAmount} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-[var(--pf-text-muted)]">{labels.tax}</dt>
        <dd className="font-medium">
          <MoneyText value={tax} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-[var(--pf-text-muted)]">{labels.gross}</dt>
        <dd className="font-semibold">
          <MoneyText value={totalAmount} />
        </dd>
      </div>
    </dl>
  );
}
