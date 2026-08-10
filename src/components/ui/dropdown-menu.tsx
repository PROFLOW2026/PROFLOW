'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { pressableClassName } from '@/components/ui/pressable';
import { rtlFlipClassName, useLocaleDir } from '@/shared/i18n/direction';
import { cn } from '@/shared/ui/cn';

export function DropdownMenu({
  dir,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) {
  const localeDir = useLocaleDir();
  return <DropdownMenuPrimitive.Root dir={dir ?? localeDir} {...props} />;
}

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    dir?: 'rtl' | 'ltr';
  }
>(function DropdownMenuContent({ className, sideOffset = 6, dir, ...props }, ref) {
  const localeDir = useLocaleDir();
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        // Radix omits `dir` from the content props type; the DOM attribute is still valid.
        {...{ dir: dir ?? localeDir }}
        className={cn(
          'z-40 min-w-48 overflow-hidden rounded-md border border-[var(--pf-border-default)] text-start',
          'bg-[var(--pf-bg-elevated)] p-1 shadow-[var(--pf-shadow-md)]',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none',
        pressableClassName,
        'data-[highlighted]:bg-[var(--pf-action-subtle-hover)]',
        'active:bg-[var(--pf-action-subtle-active)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--pf-text-muted)]',
        destructive &&
          'text-[var(--pf-action-danger)] data-[highlighted]:bg-[var(--pf-status-danger-bg)] active:bg-[var(--pf-status-danger-border)] [&_svg]:text-[var(--pf-action-danger)]',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm py-2 pe-2 ps-8 text-sm outline-none',
        pressableClassName,
        'data-[highlighted]:bg-[var(--pf-action-subtle-hover)]',
        'active:bg-[var(--pf-action-subtle-active)]',
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm py-2 pe-2 ps-8 text-sm outline-none',
        pressableClassName,
        'data-[highlighted]:bg-[var(--pf-action-subtle-hover)]',
        'active:bg-[var(--pf-action-subtle-active)]',
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-xs font-medium text-[var(--pf-text-muted)]', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-[var(--pf-border-default)]', className)}
      {...props}
    />
  );
}

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(function DropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none',
        pressableClassName,
        'data-[highlighted]:bg-[var(--pf-action-subtle-hover)] data-[state=open]:bg-[var(--pf-action-subtle-hover)]',
        'active:bg-[var(--pf-action-subtle-active)]',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--pf-text-muted)]',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className={rtlFlipClassName('ms-auto size-4')} aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    dir?: 'rtl' | 'ltr';
  }
>(function DropdownMenuSubContent({ className, sideOffset = 4, dir, ...props }, ref) {
  const localeDir = useLocaleDir();
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={sideOffset}
      {...{ dir: dir ?? localeDir }}
      className={cn(
        'z-40 min-w-40 overflow-hidden rounded-md border border-[var(--pf-border-default)] text-start',
        'bg-[var(--pf-bg-elevated)] p-1 shadow-[var(--pf-shadow-md)]',
        className,
      )}
      {...props}
    />
  );
});
