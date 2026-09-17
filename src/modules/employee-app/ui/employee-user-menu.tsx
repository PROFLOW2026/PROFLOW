'use client';

import { Building2, Check, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { employeeSignOutAction } from '@/app/[locale]/employee/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableClassName } from '@/components/ui/pressable';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface EmployeeUserMenuProps {
  readonly employeeName: string;
  readonly email: string;
  readonly organizationName: string;
}

/** Employee App user menu — mirrors Owner UserMenu chrome without Owner-only actions. */
export function EmployeeUserMenu({
  employeeName,
  email,
  organizationName,
}: EmployeeUserMenuProps) {
  const t = useTranslations('employeeApp');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const displayName = employeeName.trim() || email;
  const initials = displayName.trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tCommon('a11y.userMenu')}
        className={cn(
          pressableClassName,
          'flex min-h-11 min-w-11 items-center justify-center rounded-full p-1.5',
          'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--pf-teal-100)] text-sm font-semibold text-[var(--pf-teal-800)]">
          {initials}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-[var(--pf-text-primary)]">
            {displayName}
          </span>
          <span dir="ltr" className="block truncate text-xs text-[var(--pf-text-muted)]">
            {email}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <Building2 className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
          <span className="min-w-0 truncate">{organizationName}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tCommon('labels.language')}</DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={pending}
            onSelect={() => {
              startTransition(() => {
                router.replace(pathname, { locale: option });
              });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{LOCALE_METADATA[option].label}</span>
            {option === locale ? (
              <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={() => {
            startTransition(async () => {
              await employeeSignOutAction();
            });
          }}
        >
          <LogOut aria-hidden />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
