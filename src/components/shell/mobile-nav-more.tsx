'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  isNavItemActive,
  partitionNavItems,
  type NavItem,
} from './navigation';
import { ShellNavLink } from './shell-nav-link';

export interface MobileNavMoreProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
  pathname: string;
}

/**
 * Overflow destinations for the mobile bottom bar.
 * Loaded on demand so ordinary screens do not pay for Dialog until "More" opens.
 */
export function MobileNavMore({ open, onOpenChange, items, pathname }: MobileNavMoreProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { groups, settings } = partitionNavItems(items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="pf-mobile-nav-more"
        closeLabel={tCommon('actions.close')}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('more')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {groups.map(({ group, items: groupItems }) => (
              <div key={group}>
                <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-[var(--pf-text-secondary)] uppercase">
                  {t(`moreGroups.${group}`)}
                </p>
                <ul className="flex flex-col">
                  {groupItems.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    return (
                      <li key={item.key}>
                        <ShellNavLink
                          href={item.href}
                          label={t(item.labelKey)}
                          iconKey={item.iconKey}
                          active={active}
                          variant="sidebar"
                          muteIcon
                          onNavigate={() => onOpenChange(false)}
                          className="min-h-11 py-3"
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {settings.length > 0 ? (
              <div>
                <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-[var(--pf-text-secondary)] uppercase">
                  {t('settings')}
                </p>
                <ul className="flex flex-col">
                  {settings.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    return (
                      <li key={item.key}>
                        <ShellNavLink
                          href={item.href}
                          label={t(item.labelKey)}
                          iconKey={item.iconKey}
                          active={active}
                          variant="sidebar"
                          muteIcon
                          onNavigate={() => onOpenChange(false)}
                          className="min-h-11 py-3"
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
