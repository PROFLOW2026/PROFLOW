'use client';

import { Building2, Check, LogOut, User } from 'lucide-react';
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
import { signOutAction, switchOrganizationAction } from '@/shared/auth/actions';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { Link, usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface UserMenuProps {
  displayName: string | null;
  email: string;
  organizationName: string;
  organizations: { id: string; name: string }[];
  activeOrganizationId: string;
}

export function UserMenu({
  displayName,
  email,
  organizationName,
  organizations,
  activeOrganizationId,
}: UserMenuProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const previousOrganizationId = React.useRef(activeOrganizationId);

  React.useEffect(() => {
    if (previousOrganizationId.current === activeOrganizationId) return;
    previousOrganizationId.current = activeOrganizationId;
    setAnnouncement(organizationName);
  }, [activeOrganizationId, organizationName]);

  const initials = (displayName ?? email).trim().charAt(0).toUpperCase();

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={tCommon('a11y.userMenu')}
          className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-[var(--pf-bg-muted)]"
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
          <Link href="/settings/profile">
            <User aria-hidden />
            {t('user.profile')}
          </Link>
        </DropdownMenuItem>

        {organizations.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('organizationSwitcher.label')}</DropdownMenuLabel>
            {organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                disabled={pending}
                onSelect={() => {
                  if (organization.id === activeOrganizationId) return;
                  startTransition(async () => {
                    await switchOrganizationAction(organization.id);
                    setAnnouncement(organization.name);
                  });
                }}
              >
                <Building2 aria-hidden />
                <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                {organization.id === activeOrganizationId ? (
                  <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <DropdownMenuLabel className="truncate">{organizationName}</DropdownMenuLabel>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tCommon('labels.language')}</DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={pending}
            onSelect={() => {
              startTransition(() => {
                // Same route, different locale prefix — the user keeps their place.
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
    </>
  );
}
