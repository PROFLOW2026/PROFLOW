'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer size-4.5 shrink-0 rounded-[4px] border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)]',
        'transition-colors duration-[var(--pf-motion-fast)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        'data-[state=checked]:border-[var(--pf-action-primary)] data-[state=checked]:bg-[var(--pf-action-primary)]',
        'data-[state=indeterminate]:border-[var(--pf-action-primary)] data-[state=indeterminate]:bg-[var(--pf-action-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--pf-action-primary-fg)]">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3.5" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
