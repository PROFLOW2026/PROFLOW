'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { useSearchParams } from 'next/navigation';
import { useLocaleDir } from '@/shared/i18n/direction';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { projectIdFromPathname } from './quick-create-project';
import { shouldHideQuickCreateForRoute } from './navigation';

export interface QuickCreateAction {
  key: string;
  href: string;
  labelKey: string;
}

function QuickCreateFabPortal({ children }: { children: ReactNode }) {
  const localeDir = useLocaleDir();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<div dir={localeDir}>{children}</div>, document.body);
}

function QuickCreateMenu({
  actions,
  loadProjectActions,
}: {
  actions: QuickCreateAction[];
  loadProjectActions?: (projectId: string, root?: string) => Promise<QuickCreateAction[]>;
}) {
  const t = useTranslations('nav.newMenu');
  const localeDir = useLocaleDir();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = projectIdFromPathname(pathname);
  const projectRoot =
    projectId && pathname.includes('/employee/') ? `/employee/projects/${projectId}` : undefined;
  const [loadedProjectActions, setLoadedProjectActions] = useState<{
    projectId: string;
    actions: QuickCreateAction[];
  } | null>(null);

  useEffect(() => {
    if (!projectId || !loadProjectActions) return;
    let cancelled = false;
    void loadProjectActions(projectId, projectRoot)
      .then((next) => {
        if (!cancelled) setLoadedProjectActions({ projectId, actions: next });
      })
      .catch(() => {
        if (!cancelled) setLoadedProjectActions({ projectId, actions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, projectRoot, loadProjectActions]);

  const projectActions =
    projectId && loadProjectActions && loadedProjectActions?.projectId === projectId
      ? loadedProjectActions.actions
      : [];

  if (shouldHideQuickCreateForRoute(pathname, searchParams)) {
    return null;
  }

  const menuActions = [...projectActions, ...actions];
  if (menuActions.length === 0) return null;

  const triggerButton = (
    <button
      type="button"
      aria-label={t('trigger')}
      data-pf-quick-create="fab"
      className={cn(
        pressableChromeClassName,
        'fixed z-50 flex size-[var(--pf-fab-size)] max-w-[var(--pf-fab-size)] shrink-0 items-center justify-center rounded-full font-medium shadow-[var(--pf-shadow-lg)]',
        'bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]',
        'hover:bg-[var(--pf-action-primary-hover)] active:bg-[var(--pf-action-primary-active)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        localeDir === 'rtl' ? 'left-4' : 'right-4',
        'bottom-[calc(var(--pf-bottomnav-total-height)+var(--pf-fab-gap))] lg:bottom-[var(--pf-fab-gap)]',
      )}
    >
      <Plus className="size-6" aria-hidden />
      <span className="sr-only">{t('trigger')}</span>
    </button>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {menuActions.map((action) => (
          <DropdownMenuItem key={action.key} asChild>
            <Link href={action.href} prefetch={false}>
              {t(action.labelKey)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return <QuickCreateFabPortal>{menu}</QuickCreateFabPortal>;
}

/**
 * Global `+ New` (doc 41 §5). The menu only offers what this organization
 * actually uses, so an org without workforce never sees "Time entry".
 * Inside a project, capability-gated create links are added with that project prefilled.
 */
export function QuickCreate({
  actions,
  loadProjectActions,
}: {
  actions: QuickCreateAction[];
  loadProjectActions?: (projectId: string, root?: string) => Promise<QuickCreateAction[]>;
}) {
  return (
    <Suspense fallback={null}>
      <QuickCreateMenu actions={actions} loadProjectActions={loadProjectActions} />
    </Suspense>
  );
}
