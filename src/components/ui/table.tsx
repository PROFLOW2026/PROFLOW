import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="min-w-0 max-w-full w-full overflow-x-auto overscroll-x-contain">
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-[var(--pf-bg-subtle)]', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[var(--pf-border-default)]', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--pf-border-default)] transition-colors last:border-0',
        'hover:bg-[var(--pf-bg-subtle)] data-[state=selected]:bg-[var(--pf-teal-50)]',
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Money and quantity columns align to the end and use tabular figures. */
  numeric?: boolean;
}

export function TableHead({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold text-[var(--pf-text-secondary)]',
        numeric && 'text-end',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, numeric, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 align-middle text-start',
        numeric && 'pf-numeric text-end',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('py-3 text-xs text-[var(--pf-text-muted)]', className)} {...props} />;
}
