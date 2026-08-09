import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

export interface ResponsiveTableProps<T> {
  /** Rows shared by the desktop table and mobile cards. */
  readonly items: readonly T[];
  readonly getRowKey: (item: T) => string;
  /** Full table markup for md+ viewports — typically `<Table>…</Table>`. */
  readonly desktop: ReactNode;
  readonly renderMobileCard: (item: T) => ReactNode;
  readonly mobileListClassName?: string;
  readonly mobileCardClassName?: string;
}

/**
 * Desktop table above md; stacked tap-friendly cards below.
 * Matches the projects/clients list pattern (doc 48 §1.8).
 */
export function ResponsiveTable<T>({
  items,
  getRowKey,
  desktop,
  renderMobileCard,
  mobileListClassName,
  mobileCardClassName,
}: ResponsiveTableProps<T>) {
  return (
    <>
      <div className="hidden md:block">{desktop}</div>
      <div className={cn('flex flex-col gap-3 md:hidden', mobileListClassName)}>
        {items.map((item) => (
          <div key={getRowKey(item)} className={mobileCardClassName}>
            {renderMobileCard(item)}
          </div>
        ))}
      </div>
    </>
  );
}
