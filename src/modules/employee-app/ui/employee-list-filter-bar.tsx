'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import {
  employeeActiveChipClass,
  employeeFilterBarClass,
  employeePrimaryButtonClass,
  employeeSecondaryButtonClass,
} from './employee-surface-styles';

interface EmployeeListFilterBarProps {
  readonly activeCount: number;
  readonly isActive: boolean;
  readonly activeSummary: readonly string[];
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly children: React.ReactNode;
}

export function EmployeeListFilterBar({
  activeCount,
  isActive,
  activeSummary,
  onApply,
  onClear,
  children,
}: EmployeeListFilterBarProps) {
  const t = useTranslations('employeeApp.filters');
  const [open, setOpen] = useState(false);

  return (
    <section className={employeeFilterBarClass} aria-label={t('title')}>
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          className={employeeSecondaryButtonClass}
          onClick={() => setOpen((value) => !value)}
        >
          {activeCount > 0 ? t('mobileWithCount', { count: activeCount }) : t('mobile')}
        </button>
        {isActive ? (
          <span className="text-xs font-medium text-[var(--pf-text-brand)]">{t('active')}</span>
        ) : null}
      </div>

      <div className={cn('space-y-3', !open && 'hidden lg:block')}>{children}</div>

      <div className={cn('flex flex-wrap items-center gap-2', !open && 'hidden lg:flex')}>
        <button type="button" className={employeePrimaryButtonClass} onClick={onApply}>
          {t('apply')}
        </button>
        <button
          type="button"
          className={employeeSecondaryButtonClass}
          onClick={onClear}
          disabled={!isActive}
        >
          {t('clear')}
        </button>
      </div>

      {isActive && activeSummary.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--pf-border-default)] pt-3">
          <span className="text-xs font-semibold text-[var(--pf-text-brand)]">{t('active')}</span>
          {activeSummary.map((chip) => (
            <span key={chip} className={employeeActiveChipClass}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-[var(--pf-text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
