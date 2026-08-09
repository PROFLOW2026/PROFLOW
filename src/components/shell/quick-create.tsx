'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface QuickCreateAction {
  key: string;
  href: string;
  labelKey: string;
}

/**
 * Global `+ New` (doc 41 §5). The menu only offers what this organization
 * actually uses, so an org without workforce never sees "Time entry".
 */
export function QuickCreate({ actions }: { actions: QuickCreateAction[] }) {
  const t = useTranslations('nav.newMenu');

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('trigger')}
          className={cn(
            'fixed z-20 flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-[var(--pf-motion-fast)]',
            'bottom-[calc(var(--pf-bottomnav-height)+1rem+env(safe-area-inset-bottom))] end-4 size-14',
            'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)] shadow-[var(--pf-shadow-lg)]',
            'active:bg-[var(--pf-action-primary-active)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
            'lg:static lg:bottom-auto lg:end-auto lg:size-auto lg:h-8 lg:rounded-md lg:px-3 lg:text-[0.8125rem] lg:shadow-none',
            'lg:hover:bg-[var(--pf-action-primary-hover)]',
          )}
        >
          <Plus className="size-6 lg:size-4" aria-hidden />
          <span className="hidden lg:inline">{t('trigger')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="max-lg:mb-[calc(var(--pf-bottomnav-height)+env(safe-area-inset-bottom))]"
      >
        {actions.map((action) => (
          <DropdownMenuItem key={action.key} asChild>
            <Link href={action.href}>{t(action.labelKey)}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
