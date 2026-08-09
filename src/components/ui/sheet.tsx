'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

/**
 * Side / bottom sheet built on Radix Dialog.
 *
 * Sides use logical inline edges (`start` / `end`) so a start-edge drawer sits
 * on the right in Hebrew and the left in English without a second layout.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-60 bg-[rgb(27_36_48/0.45)]',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
});

export type SheetSide = 'start' | 'end' | 'bottom';

// Side enter/exit uses fade only — physical slide-from-left/right fights RTL.
const SIDE_MOTION =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const SIDE_CLASSES: Record<SheetSide, string> = {
  start: cn(
    'inset-y-0 start-0 h-full w-full max-w-sm border-e border-[var(--pf-border-default)]',
    SIDE_MOTION,
  ),
  end: cn(
    'inset-y-0 end-0 h-full w-full max-w-sm border-s border-[var(--pf-border-default)]',
    SIDE_MOTION,
  ),
  bottom: cn(
    'inset-x-0 bottom-0 mt-24 max-h-[90dvh] rounded-t-xl border-t border-[var(--pf-border-default)]',
    SIDE_MOTION,
    'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
  ),
};

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  closeLabel?: string;
  /** Logical edge the sheet hinges from. Default `end` (filters / detail). */
  side?: SheetSide;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(function SheetContent(
  { className, children, closeLabel = 'Close', side = 'end', dir, ...props },
  ref,
) {
  const localeDir = useLocaleDir();
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        dir={dir ?? localeDir}
        className={cn(
          'fixed z-60 flex flex-col overflow-hidden bg-[var(--pf-bg-elevated)] shadow-[var(--pf-shadow-lg)] text-start',
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute end-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--pf-text-muted)] transition-colors hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          aria-label={closeLabel}
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-[var(--pf-border-default)] px-5 py-4 pe-12', className)}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-[var(--pf-border-default)] px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4',
        className,
      )}
      {...props}
    />
  );
}

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />;
});

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-[var(--pf-text-secondary)]', className)}
      {...props}
    />
  );
});
