'use client';

import { Check, LogOut, User } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableClassName } from '@/components/ui/pressable';
import { signOutAction } from '@/shared/auth/actions';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { persistLocalePreferenceAction } from '@/shared/i18n/persist-locale-preference';
import { Link, usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface UserMenuProps {
  displayName: string | null;
  email: string;
}

export function UserMenu({ displayName, email }: UserMenuProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const initials = (displayName ?? email).trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={tCommon('a11y.userMenu')}
          className={cn(
            pressableClassName,
            'flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full p-1.5',
            'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
            'lg:min-h-8 lg:min-w-8 lg:p-0.5',
          )}
        >
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--pf-teal-100)] text-sm font-semibold text-[var(--pf-teal-800)]">
          {initials}
        </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-[var(--pf-text-primary)]">
            {displayName ?? email}
          </span>
          <span dir="ltr" className="block truncate text-xs text-[var(--pf-text-muted)]">
            {email}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings/profile" prefetch={false}>
            <User aria-hidden />
            {t('user.profile')}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tCommon('labels.language')}</DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={pending}
            onSelect={() => {
              if (option === locale) return;
              startTransition(async () => {
                await persistLocalePreferenceAction(option);
                router.replace(pathname, { locale: option });
              });
            }}
          >
            <span className={cn('min-w-0 flex-1 truncate')}>{LOCALE_METADATA[option].label}</span>
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
              await signOutAction();
            });
          }}
        >
          <LogOut aria-hidden />
          {t('user.signOut')}
        </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
