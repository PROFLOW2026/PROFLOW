'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from '@/shared/i18n/navigation';
import { partitionEmployeeNavItems } from '@/modules/employee-app/application/employee-navigation';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';
import { cn } from '@/shared/ui/cn';
import { EmployeeNavIcon, employeeNavIconKeyFromHref } from './employee-nav-icon';

export interface EmployeeMobileNavMoreProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly EmployeeNavItem[];
  pathname: string;
}

function OverflowNavLink({
  item,
  pathname,
  onNavigate,
  t,
}: {
  item: EmployeeNavItem;
  pathname: string;
  onNavigate: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const active =
    item.href === '/employee'
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
          : 'text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-subtle)]',
      )}
    >
      <EmployeeNavIcon
        iconKey={employeeNavIconKeyFromHref(item.href)}
        className={cn('size-4 shrink-0', active ? 'text-[var(--pf-accent)]' : 'text-[var(--pf-text-muted)]')}
      />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

export function EmployeeMobileNavMore({
  open,
  onOpenChange,
  items,
  pathname,
}: EmployeeMobileNavMoreProps) {
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const { planner, management } = partitionEmployeeNavItems(items);
  const showManagementSection = management.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="pf-employee-mobile-nav-more"
        closeLabel={tCommon('actions.close')}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('employeeApp.nav.more')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {planner.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--pf-text-muted)]">
                  {t('employeeApp.nav.myWork')}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {planner.map((item) => (
                    <li key={item.href}>
                      <OverflowNavLink
                        item={item}
                        pathname={pathname}
                        onNavigate={() => onOpenChange(false)}
                        t={t}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showManagementSection ? (
              <div className="flex flex-col gap-1">
                <div className="mx-3 mb-1 border-t border-[var(--pf-border-default)]" aria-hidden />
                <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--pf-text-muted)]">
                  {t('employeeApp.nav.managementOffice')}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {management.map((item) => (
                    <li key={item.href}>
                      <OverflowNavLink
                        item={item}
                        pathname={pathname}
                        onNavigate={() => onOpenChange(false)}
                        t={t}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
