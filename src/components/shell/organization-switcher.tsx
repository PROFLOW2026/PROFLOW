'use client';

import { Building2, Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { switchOrganizationAction } from '@/shared/auth/actions';
import { cn } from '@/shared/ui/cn';

export interface OrganizationSwitcherProps {
  organizationName: string;
  organizations: { id: string; name: string }[];
  activeOrganizationId: string;
  /** Sidebar header: plain company name; multi-org adds a subtle chevron only. */
  variant?: 'default' | 'sidebar';
}

export function OrganizationSwitcher({
  organizationName,
  organizations,
  activeOrganizationId,
  variant = 'default',
}: OrganizationSwitcherProps) {
  const t = useTranslations('nav');
  const [pending, startTransition] = React.useTransition();
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const previousOrganizationId = React.useRef(activeOrganizationId);

  React.useEffect(() => {
    if (previousOrganizationId.current === activeOrganizationId) return;
    previousOrganizationId.current = activeOrganizationId;
    setAnnouncement(organizationName);
  }, [activeOrganizationId, organizationName]);

  const canSwitch = organizations.length > 1;
  const isSidebar = variant === 'sidebar';

  if (!canSwitch) {
    return (
      <span
        className={cn(
          'min-w-0 truncate text-sm font-semibold',
          !isSidebar && 'flex max-w-[min(100%,18rem)] items-center gap-2',
        )}
        title={organizationName}
      >
        {!isSidebar ? <Building2 className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden /> : null}
        {organizationName}
      </span>
    );
  }

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          aria-label={t('organizationSwitcher.current', { name: organizationName })}
          className={cn(
            pressableClassName,
            isSidebar
              ? 'flex min-w-0 items-center gap-1 rounded-md px-0 py-0.5 text-start hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]'
              : cn(
                  'flex min-h-9 max-w-[min(100%,20rem)] items-center gap-1.5 rounded-lg border border-[var(--pf-border-default)]',
                  'bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-start',
                  'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
                ),
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          )}
        >
          {!isSidebar ? (
            <Building2 className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
          ) : null}
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            title={organizationName}
          >
            {organizationName}
          </span>
          <ChevronDown
            className={cn(
              'shrink-0 text-[var(--pf-text-muted)]',
              isSidebar ? 'size-3.5' : 'size-4',
            )}
            aria-hidden
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-64 max-w-[min(100vw-2rem,24rem)]">
          <DropdownMenuLabel>{t('organizationSwitcher.label')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
