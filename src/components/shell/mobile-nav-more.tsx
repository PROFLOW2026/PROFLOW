'use client';

import type * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NavAccordionSections } from './nav-accordion';
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
  footer?: React.ReactNode;
}

/**
 * Overflow destinations for the mobile bottom bar.
 * Loaded on demand so ordinary screens do not pay for Dialog until "More" opens.
 * Groups use the same exclusive accordion as the desktop sidebar.
 */
export function MobileNavMore({ open, onOpenChange, items, pathname, footer }: MobileNavMoreProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { groups, standalone } = partitionNavItems(items);

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
          <div className="flex flex-col gap-3">
            {groups.length > 0 ? (
              <NavAccordionSections
                groups={groups}
                pathname={pathname}
                groupLabel={(group) => t(`moreGroups.${group}`)}
                itemLabel={(item) => t(item.labelKey)}
                expandLabel={t('accordion.expand')}
                collapseLabel={t('accordion.collapse')}
                muteIcon
                linkClassName="min-h-11 py-3"
                onNavigate={() => onOpenChange(false)}
              />
            ) : null}
            {standalone.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {standalone.map((item) => {
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
                        className="min-h-11 py-3"
                        onNavigate={() => onOpenChange(false)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {footer ? (
              <div className="mt-1 border-t border-[var(--pf-border-default)] pt-3">{footer}</div>
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
