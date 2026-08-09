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
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { isFocusedComposerPath } from './navigation';

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
  const pathname = usePathname();
  const demoteFab = isFocusedComposerPath(pathname);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('trigger')}
          data-pf-quick-create={demoteFab ? 'toolbar' : 'fab'}
          className={cn(
            'z-30 flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-[var(--pf-motion-fast)]',
            'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]',
            'active:bg-[var(--pf-action-primary-active)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
            demoteFab
              ? 'static size-auto h-9 shrink-0 rounded-md px-3 text-[0.8125rem] shadow-none hover:bg-[var(--pf-action-primary-hover)]'
              : cn(
                  'fixed bottom-[calc(var(--pf-bottomnav-height)+var(--pf-fab-gap)+env(safe-area-inset-bottom,0px))] end-4 size-[var(--pf-fab-size)] shadow-[var(--pf-shadow-lg)]',
                  'lg:static lg:bottom-auto lg:end-auto lg:size-auto lg:h-8 lg:rounded-md lg:px-3 lg:text-[0.8125rem] lg:shadow-none',
                  'lg:hover:bg-[var(--pf-action-primary-hover)]',
                ),
          )}
        >
          <Plus className={cn(demoteFab ? 'size-4' : 'size-6 lg:size-4')} aria-hidden />
          <span className={cn(demoteFab ? 'inline' : 'hidden lg:inline')}>{t('trigger')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={demoteFab ? 'bottom' : 'top'}>
        {actions.map((action) => (
          <DropdownMenuItem key={action.key} asChild>
            <Link href={action.href}>{t(action.labelKey)}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
