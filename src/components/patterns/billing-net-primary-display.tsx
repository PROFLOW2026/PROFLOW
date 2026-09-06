'use client';

import { MoneyText } from '@/components/patterns/money-text';
import { cn } from '@/shared/ui/cn';
import type { MoneyValue } from '@/shared/money';

/**
 * Owner-preferred billing display: NET primary, GROSS secondary (incl. VAT).
 * Accounting truth unchanged — presentation only.
 */
export function BillingNetPrimaryDisplay({
  netAmount,
  grossAmount,
  netLabel,
  grossLabel,
  className,
  netClassName,
  grossClassName,
}: {
  readonly netAmount: MoneyValue;
  readonly grossAmount: MoneyValue;
  readonly netLabel: string;
  readonly grossLabel: string;
  readonly className?: string;
  readonly netClassName?: string;
  readonly grossClassName?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <div className={cn('font-semibold tabular-nums', netClassName)}>
        <MoneyText value={netAmount} />
      </div>
      <p className={cn('text-xs text-[var(--pf-text-muted)]', grossClassName)}>
        {netLabel}
      </p>
      <p className={cn('text-xs text-[var(--pf-text-muted)] tabular-nums', grossClassName)}>
        ({grossLabel}: <MoneyText value={grossAmount} className="inline font-medium" />)
      </p>
    </div>
  );
}
