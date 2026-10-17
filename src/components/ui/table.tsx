import * as React from 'react';
import { cn } from '@/shared/ui/cn';

/** Marker for the mobile stacked-card rules in `globals.css` (below the `md` breakpoint). */
export const RESPONSIVE_TABLE_ATTR = 'data-pf-responsive-table';

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeText(props.children);
  }
  return '';
}

function headerLabel(node: React.ReactNode): string {
  return nodeText(node).replace(/\s+/g, ' ').trim();
}

function elementChildren(children: React.ReactNode): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      const fragmentProps = child.props as { children?: React.ReactNode };
      elements.push(...elementChildren(fragmentProps.children));
      return;
    }
    elements.push(child);
  });
  return elements;
}

/** Column labels from the first header row, expanded by `colSpan`. */
export function extractTableHeaderLabels(children: React.ReactNode): string[] {
  for (const section of elementChildren(children)) {
    if (section.type !== TableHeader) continue;
    const sectionProps = section.props as { children?: React.ReactNode };
    for (const row of elementChildren(sectionProps.children)) {
      if (row.type !== TableRow) continue;
      const rowProps = row.props as { children?: React.ReactNode };
      const labels: string[] = [];
      for (const cell of elementChildren(rowProps.children)) {
        if (cell.type !== TableHead) continue;
        const cellProps = cell.props as { children?: React.ReactNode; colSpan?: number };
        const span = Math.max(1, Number(cellProps.colSpan ?? 1) || 1);
        const label = headerLabel(cellProps.children);
        for (let index = 0; index < span; index += 1) labels.push(index === 0 ? label : '');
      }
      if (labels.length > 0) return labels;
    }
  }
  return [];
}

function labelForSpan(labels: readonly string[], start: number, span: number): string {
  return labels
    .slice(start, start + span)
    .map((label) => label.trim())
    .filter(Boolean)
    .join(' · ');
}

function withBodyLabels(children: React.ReactNode, labels: readonly string[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === React.Fragment) {
      const fragmentProps = child.props as { children?: React.ReactNode };
      return React.cloneElement(child, undefined, withBodyLabels(fragmentProps.children, labels));
    }
    if (child.type !== TableBody) return child;
    const bodyProps = child.props as { children?: React.ReactNode };
    return React.cloneElement(child, undefined, labelBodyRows(bodyProps.children, labels));
  });
}

function labelBodyRows(children: React.ReactNode, labels: readonly string[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === React.Fragment) {
      const fragmentProps = child.props as { children?: React.ReactNode };
      return React.cloneElement(child, undefined, labelBodyRows(fragmentProps.children, labels));
    }
    if (child.type !== TableRow) return child;
    const rowProps = child.props as { children?: React.ReactNode };
    let column = 0;
    const cells = React.Children.map(rowProps.children, (cell) => {
      if (!React.isValidElement(cell) || cell.type !== TableCell) return cell;
      const cellProps = cell.props as { colSpan?: number };
      const span = Math.max(1, Number(cellProps.colSpan ?? 1) || 1);
      const dataLabel = labelForSpan(labels, column, span);
      column += span;
      return React.cloneElement(cell as React.ReactElement<{ 'data-label'?: string }>, {
        'data-label': dataLabel,
      });
    });
    return React.cloneElement(child, undefined, cells);
  });
}

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const labels = extractTableHeaderLabels(children);
  return (
    <div
      {...{ [RESPONSIVE_TABLE_ATTR]: '' }}
      className="relative min-w-0 w-full max-w-full"
    >
      <table className={cn('w-full max-w-full caption-bottom border-collapse text-sm', className)} {...props}>
        {withBodyLabels(children, labels)}
      </table>
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
  /** Column name shown above the value in the mobile stacked card. */
  'data-label'?: string;
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
        'min-w-0 whitespace-normal break-words px-3 py-2.5 text-start text-xs font-semibold text-[var(--pf-text-secondary)]',
        numeric && 'text-end',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  'data-label': dataLabel,
  ...props
}: TableCellProps) {
  return (
    <td
      data-label={dataLabel}
      className={cn(
        'min-w-0 max-w-full break-words px-3 py-2.5 align-middle text-start [overflow-wrap:anywhere]',
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
