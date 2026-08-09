'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, dir, ...props }, ref) {
  const localeDir = useLocaleDir();
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        dir={dir ?? localeDir}
        className={cn(
          'z-40 max-w-72 rounded-md bg-[var(--pf-bg-inverse)] px-2.5 py-1.5 text-xs text-[var(--pf-text-inverse)] text-start',
          'shadow-[var(--pf-shadow-md)]',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
