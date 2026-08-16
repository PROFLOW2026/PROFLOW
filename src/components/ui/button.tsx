import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-medium',
    pressableClassName,
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
    // Touch devices fire :active, not :hover - pressed feedback must not be hover-only.
    'disabled:pointer-events-none disabled:bg-[var(--pf-status-disabled-bg)] disabled:text-[var(--pf-status-disabled-fg)] disabled:border-[var(--pf-status-disabled-border)]',
    'aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-90',
    'data-[loading]:pointer-events-none',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'border border-transparent bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] hover:bg-[var(--pf-action-primary-hover)] active:bg-[var(--pf-action-primary-active)]',
        secondary:
          'border border-[var(--pf-border-strong)] bg-[var(--pf-action-secondary)] text-[var(--pf-text-primary)] hover:bg-[var(--pf-action-secondary-hover)] active:bg-[var(--pf-action-secondary-active)]',
        ghost:
          'border border-transparent text-[var(--pf-text-secondary)] hover:bg-[var(--pf-action-subtle-hover)] hover:text-[var(--pf-text-brand)] active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-brand)] disabled:bg-transparent disabled:border-transparent',
        danger:
          'border border-transparent bg-[var(--pf-action-danger)] text-[var(--pf-text-inverse)] hover:bg-[var(--pf-action-danger-hover)] active:bg-[var(--pf-action-danger-active)]',
        // Destructive actions that still need to read as secondary weight.
        dangerGhost:
          'border border-transparent text-[var(--pf-action-danger)] hover:bg-[var(--pf-status-danger-bg)] active:bg-[var(--pf-status-danger-border)] disabled:bg-transparent disabled:border-transparent',
        link: 'border border-transparent text-[var(--pf-text-brand)] underline-offset-4 hover:underline active:underline active:opacity-80 active:scale-100 disabled:bg-transparent disabled:border-transparent',
      },
      size: {
        // Mobile first: ≥44px touch (docs 62–63); denser on md+.
        sm: 'min-h-11 px-3 text-[0.8125rem] md:h-8 md:min-h-8',
        md: 'min-h-11 h-11 px-4 text-sm',
        // Comfortable touch target for the mobile surface (doc 62).
        lg: 'h-12 min-h-12 px-6 text-base',
        icon: 'size-11',
        iconSm: 'size-11 md:size-8',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows spinner, sets aria-busy, and disables the control (double-submit guard). */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, loading = false, children, disabled, ...props },
  ref,
) {
  if (asChild) {
    // Slot forwards props onto exactly one child, so the spinner slot cannot be
    // added here. `asChild` is for links, which have no pending state anyway.
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  const isDisabled = Boolean(disabled) || loading;

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading ? '' : undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
