'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { isFocusedComposerPath, shouldHideQuickCreateForRoute } from './navigation';

export interface QuickCreateAction {
  key: string;
  href: string;
  labelKey: string;
}

const mobileFabPositionStyle: CSSProperties = {
  bottom: 'calc(var(--pf-mobile-chrome-bottom) + var(--pf-fab-gap))',
  insetInlineEnd:
    'max(1rem, calc(var(--pf-visual-viewport-offset-left, 0px) + 1rem))',
};

function QuickCreateFabPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function QuickCreateMenu({ actions }: { actions: QuickCreateAction[] }) {
  const t = useTranslations('nav.newMenu');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const demoteFab = isFocusedComposerPath(pathname);

  if (shouldHideQuickCreateForRoute(pathname, searchParams)) {
    return null;
  }

  if (actions.length === 0) return null;

  const triggerButton = (
    <button
      type="button"
      aria-label={t('trigger')}
      data-pf-quick-create={demoteFab ? 'toolbar' : 'fab'}
      className={cn(
        pressableChromeClassName,
        'z-30 flex shrink-0 items-center justify-center gap-2 rounded-full font-medium',
        'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]',
        'active:bg-[var(--pf-action-primary-active)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        demoteFab
          ? 'static size-auto h-11 min-h-11 shrink-0 rounded-md px-3 text-[0.8125rem] shadow-none hover:bg-[var(--pf-action-primary-hover)]'
          : cn(
              'fixed size-[var(--pf-fab-size)] max-w-[var(--pf-fab-size)] shadow-[var(--pf-shadow-lg)]',
              'lg:static lg:bottom-auto lg:end-auto lg:size-auto lg:h-11 lg:min-h-11 lg:max-w-none lg:rounded-md lg:px-3 lg:text-[0.8125rem] lg:shadow-none',
              'lg:hover:bg-[var(--pf-action-primary-hover)]',
            ),
      )}
      style={demoteFab ? undefined : mobileFabPositionStyle}
    >
      <Plus className={cn(demoteFab ? 'size-4' : 'size-6 lg:size-4')} aria-hidden />
      <span className={cn(demoteFab ? 'inline' : 'hidden lg:inline')}>{t('trigger')}</span>
    </button>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={demoteFab ? 'bottom' : 'top'}>
        {actions.map((action) => (
          <DropdownMenuItem key={action.key} asChild>
            <Link href={action.href} prefetch={false}>
              {t(action.labelKey)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (demoteFab) return menu;

  return <QuickCreateFabPortal>{menu}</QuickCreateFabPortal>;
}

/**
 * Global `+ New` (doc 41 §5). The menu only offers what this organization
 * actually uses, so an org without workforce never sees "Time entry".
 */
export function QuickCreate({ actions }: { actions: QuickCreateAction[] }) {
  return (
    <Suspense fallback={null}>
      <QuickCreateMenu actions={actions} />
    </Suspense>
  );
}
