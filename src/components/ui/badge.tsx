import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral:
          'border-[var(--pf-status-neutral-border)] bg-[var(--pf-status-neutral-bg)] text-[var(--pf-status-neutral-fg)]',
        success:
          'border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]',
        warning:
          'border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]',
        danger:
          'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]',
        info: 'border-[var(--pf-status-info-border)] bg-[var(--pf-status-info-bg)] text-[var(--pf-status-info-fg)]',
        pending:
          'border-[var(--pf-status-pending-border)] bg-[var(--pf-status-pending-bg)] text-[var(--pf-status-pending-fg)]',
        brand: 'border-[var(--pf-teal-100)] bg-[var(--pf-teal-50)] text-[var(--pf-teal-800)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
