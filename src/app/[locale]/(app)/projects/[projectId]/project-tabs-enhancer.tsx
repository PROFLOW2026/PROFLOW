'use client';

import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryTabPending } from '@/components/patterns/query-tab-pending';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { type ProjectTabKey } from './project-tab-order';
import { TabPanelSkeleton } from './tab-panel-skeleton';

interface ProjectTabsEnhancerProps {
  tabs: readonly ProjectTabKey[];
  serverActiveTab: ProjectTabKey;
  activeTab?: ProjectTabKey;
  children: ReactNode;
}

/**
 * Soft-nav + optimistic pending for the Server-rendered tablist
 * (`[data-pf-project-tabs]`). Attaches in `useLayoutEffect` so hops work as
 * soon as the enhancer hydrates; URL remains source of truth after settle.
 */
export function ProjectTabsEnhancer(props: ProjectTabsEnhancerProps) {
  if (props.activeTab && props.tabs.includes(props.activeTab)) {
    return (
      <ProjectTabsEnhancerChrome tabs={props.tabs} activeTab={props.activeTab}>
        {props.children}
      </ProjectTabsEnhancerChrome>
    );
  }

  return (
    <Suspense fallback={<PanelSlot isPending={false}>{props.children}</PanelSlot>}>
      <ProjectTabsEnhancerWithParams {...props} />
    </Suspense>
  );
}

function ProjectTabsEnhancerWithParams({
  tabs,
  serverActiveTab,
  children,
}: ProjectTabsEnhancerProps) {
  const searchParams = useSearchParams();
  const urlTabRaw = searchParams?.get('tab') ?? 'overview';
  const urlTab: ProjectTabKey = tabs.includes(urlTabRaw as ProjectTabKey)
    ? (urlTabRaw as ProjectTabKey)
    : serverActiveTab;

  return (
    <ProjectTabsEnhancerChrome tabs={tabs} activeTab={urlTab}>
      {children}
    </ProjectTabsEnhancerChrome>
  );
}

function ProjectTabsEnhancerChrome({
  tabs,
  activeTab,
  children,
}: {
  tabs: readonly ProjectTabKey[];
  activeTab: ProjectTabKey;
  children: ReactNode;
}) {
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const { displayTab, isPending, navigateTab } = useQueryTabPending(activeTab);
  const navigatingRef = useRef(tCommon('a11y.navigating'));
  const navigateTabRef = useRef(navigateTab);
  const pathnameRef = useRef(pathname);
  const tabsRef = useRef(tabs);

  useLayoutEffect(() => {
    navigatingRef.current = tCommon('a11y.navigating');
    navigateTabRef.current = navigateTab;
    pathnameRef.current = pathname;
    tabsRef.current = tabs;
  }, [tCommon, navigateTab, pathname, tabs]);

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-pf-project-tabs]');
    if (!root) return;

    root.dataset.pfTabsReady = '';

    const buttons = [...root.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')];

    for (const button of buttons) {
      const tab = button.dataset.tab as ProjectTabKey | undefined;
      if (!tab || !tabs.includes(tab)) continue;

      const selected = displayTab === tab;
      const pendingThis = isPending && selected;

      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.dataset.state = selected ? 'active' : 'inactive';
      button.tabIndex = selected ? 0 : -1;
      if (isPending && !selected) {
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.removeAttribute('aria-disabled');
      }

      if (pendingThis) {
        button.dataset.pending = '';
      } else {
        delete button.dataset.pending;
      }

      const label = button.querySelector('[data-pf-tab-label]');
      if (!label) continue;

      let spinner = label.querySelector<HTMLElement>('[data-pf-tab-spinner]');
      let status = label.querySelector<HTMLElement>('[data-pf-tab-status]');
      if (pendingThis) {
        if (!spinner) {
          spinner = document.createElement('span');
          spinner.dataset.pfTabSpinner = '';
          spinner.setAttribute('aria-hidden', 'true');
          spinner.className = 'inline-flex size-3.5 shrink-0';
          spinner.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5 shrink-0 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
          label.insertBefore(spinner, label.firstChild);
        }
        if (!status) {
          status = document.createElement('span');
          status.dataset.pfTabStatus = '';
          status.className = 'sr-only';
          status.textContent = navigatingRef.current;
          label.appendChild(status);
        } else {
          status.textContent = navigatingRef.current;
        }
      } else {
        spinner?.remove();
        status?.remove();
      }
    }

    if (isPending) {
      root.setAttribute('aria-busy', 'true');
    } else {
      root.removeAttribute('aria-busy');
    }
  }, [displayTab, isPending, tabs]);

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-pf-project-tabs]');
    if (!root) return;

    function softNavigate(tab: string) {
      navigateTabRef.current(tab, () => {
        const params = new URLSearchParams();
        if (tab !== 'overview') {
          params.set('tab', tab);
        }
        const query = params.toString();
        const path = pathnameRef.current;
        router.replace(query ? `${path}?${query}` : path);
      });
    }

    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.('[role="tab"][data-tab]');
      if (!target || !root!.contains(target)) return;
      const tab = (target as HTMLElement).dataset.tab;
      if (!tab || !tabsRef.current.includes(tab as ProjectTabKey)) return;
      if ((target as HTMLElement).getAttribute('aria-disabled') === 'true') {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      softNavigate(tab);
    }

    function onKeyDown(event: KeyboardEvent) {
      const buttons = [
        ...root!.querySelectorAll<HTMLElement>(
          '[role="tab"][data-tab]:not([aria-disabled="true"])',
        ),
      ];
      if (buttons.length === 0) return;
      const currentIdx = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      if (currentIdx < 0) return;

      const dirAttr =
        root!.getAttribute('dir') ??
        root!.parentElement?.getAttribute('dir') ??
        document.documentElement.dir;
      const rtl = dirAttr === 'rtl';
      let nextIdx = currentIdx;

      if (event.key === 'ArrowRight') {
        nextIdx = rtl ? currentIdx - 1 : currentIdx + 1;
      } else if (event.key === 'ArrowLeft') {
        nextIdx = rtl ? currentIdx + 1 : currentIdx - 1;
      } else if (event.key === 'Home') {
        nextIdx = 0;
      } else if (event.key === 'End') {
        nextIdx = buttons.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      nextIdx = (nextIdx + buttons.length) % buttons.length;
      const next = buttons[nextIdx];
      const tab = next?.dataset.tab;
      if (!tab) return;
      next.focus();
      softNavigate(tab);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      delete root.dataset.pfTabsReady;
    };
  }, [router]);

  return <PanelSlot isPending={isPending}>{children}</PanelSlot>;
}

function PanelSlot({ isPending, children }: { isPending: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full" aria-busy={isPending || undefined}>
      {isPending ? (
        <div className="pt-4">
          <TabPanelSkeleton />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
