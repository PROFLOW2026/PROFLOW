'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'start', sideOffset = 6, dir, ...props }, ref) {
  const localeDir = useLocaleDir();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        dir={dir ?? localeDir}
        className={cn(
          'z-40 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-elevated)] p-4 text-start',
          'shadow-[var(--pf-shadow-md)] outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
