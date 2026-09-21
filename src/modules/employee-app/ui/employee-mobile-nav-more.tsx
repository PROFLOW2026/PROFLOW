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
import { cn } from '@/shared/ui/cn';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';

export interface EmployeeMobileNavMoreProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly EmployeeNavItem[];
  pathname: string;
}

export function EmployeeMobileNavMore({
  open,
  onOpenChange,
  items,
  pathname,
}: EmployeeMobileNavMoreProps) {
  const t = useTranslations();
  const tCommon = useTranslations('common');

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
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium',
                      active
                        ? 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                        : 'text-[var(--pf-text-primary)] hover:bg-[var(--pf-surface-2)]',
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
