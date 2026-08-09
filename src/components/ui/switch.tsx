'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { dir?: 'rtl' | 'ltr' }
>(function Switch({ className, dir, ...props }, ref) {
  const localeDir = useLocaleDir();
  return (
    <SwitchPrimitive.Root
      ref={ref}
      dir={dir ?? localeDir}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent',
        'transition-colors duration-[var(--pf-motion-fast)]',
        'data-[state=checked]:bg-[var(--pf-action-primary)] data-[state=unchecked]:bg-[var(--pf-neutral-300)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-[var(--pf-bg-surface)] shadow-sm ring-0',
          'transition-transform duration-[var(--pf-motion-fast)]',
          // Pair ltr/rtl variants so unchecked→checked travel mirrors correctly
          // (a bare checked translate-x can win over rtl:-translate-x).
          'data-[state=unchecked]:translate-x-0',
          'ltr:data-[state=checked]:translate-x-5',
          'rtl:data-[state=checked]:-translate-x-5',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
