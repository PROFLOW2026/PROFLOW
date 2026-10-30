'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/shared/ui/cn';

/** Root layout for client-side Radix detail tabs (360 shells). */
export const mainAppDetailTabsRootClassName = 'flex min-w-0 flex-col gap-4';

/** Panel stack inside each tab. */
export const mainAppDetailTabsContentClassName = 'flex min-w-0 flex-col gap-4';

/** Outer frame for route-based hub tab shells (projects, commercial frame). */
export const mainAppDetailRouteTabsFrameClassName = 'min-w-0 max-w-full';

/**
 * Horizontal scroll + underline border for detail tab strips.
 * Aligns Radix `TabsList` with route `nav` / `role="tablist"` markup.
 */
export const mainAppDetailRouteTabListClassName =
  'flex min-w-0 max-w-full w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Inner project hub section nav (pill links under a hub). */
export const mainAppDetailHubSectionNavClassName =
  'flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export function MainAppDetailTabsShell({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Tabs>) {
  return <Tabs className={cn(mainAppDetailTabsRootClassName, className)} {...props} />;
}

export function MainAppDetailTabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsList>) {
  return <TabsList className={className} {...props} />;
}

export function MainAppDetailTabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsContent>) {
  return <TabsContent className={cn(mainAppDetailTabsContentClassName, className)} {...props} />;
}

export { TabsTrigger as MainAppDetailTabsTrigger };

export function MainAppDetailAdvancedSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  if (!children) return null;

  return (
    <details className="rounded-md border border-[var(--pf-border-default)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--pf-text-secondary)] marker:me-2">
        {title}
      </summary>
      <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] p-4">
        {children}
      </div>
    </details>
  );
}
