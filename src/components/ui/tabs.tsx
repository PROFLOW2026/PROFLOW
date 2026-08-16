'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export function Tabs({
  dir,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  const localeDir = useLocaleDir();
  return <TabsPrimitive.Root dir={dir ?? localeDir} {...props} />;
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        // Contained horizontal scroll - never widen the page for many tabs.
        'flex min-w-0 max-w-full w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-start',
        // ≥44px touch; underline tabs stay dense but pressable on mobile.
        'min-h-11',
        pressableClassName,
        'text-[var(--pf-text-secondary)]',
        'hover:text-[var(--pf-text-primary)]',
        // Touch press (active), not hover-only.
        'active:bg-[var(--pf-action-subtle-hover)] active:text-[var(--pf-text-primary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        'data-[state=active]:border-[var(--pf-action-primary)] data-[state=active]:text-[var(--pf-text-brand)]',
        'data-[state=active]:active:bg-[var(--pf-action-subtle-active)]',
        // Optimistic / in-flight tab switch (set by ProjectTabsShell).
        'data-[pending]:cursor-wait data-[pending]:opacity-90 data-[pending]:text-[var(--pf-text-brand)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn('pt-4 outline-none', className)} {...props} />;
});
