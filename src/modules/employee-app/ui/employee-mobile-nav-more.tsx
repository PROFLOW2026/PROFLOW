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
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium',
        active
          ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
          : 'text-[var(--pf-text-primary)] hover:bg-[var(--pf-surface-2)]',
      )}
    >
      {t(item.labelKey)}
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
          <div className="flex flex-col gap-3">
            {planner.length > 0 ? (
              <ul className="flex flex-col gap-1">
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
            ) : null}

            {showManagementSection ? (
              <div className="flex flex-col gap-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
                  {t('employeeApp.nav.managementOffice')}
                </p>
                <ul className="flex flex-col gap-1">
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
