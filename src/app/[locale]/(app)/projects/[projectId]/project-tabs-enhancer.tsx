'use client';

import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryTabPending } from '@/components/patterns/query-tab-pending';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import {
  activeHubFromParams,
  defaultSectionForHub,
  type ProjectHubKey,
} from './project-hub-order';
import { TabPanelSkeleton } from './tab-panel-skeleton';

/** Money/work hubs run full module loaders — prefetch on hover freezes dev/local DB. */
const HUB_PREFETCH_SKIP = new Set<ProjectHubKey>(['money', 'work']);

interface ProjectTabsEnhancerProps {
  tabs: readonly ProjectHubKey[];
  serverActiveHub: ProjectHubKey;
  activeHub?: ProjectHubKey;
  children: ReactNode;
}

export function ProjectTabsEnhancer(props: ProjectTabsEnhancerProps) {
  if (props.activeHub && props.tabs.includes(props.activeHub)) {
    return (
      <ProjectTabsEnhancerChrome tabs={props.tabs} activeHub={props.activeHub}>
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
  serverActiveHub,
  children,
}: ProjectTabsEnhancerProps) {
  const searchParams = useSearchParams();
  const urlTabRaw = searchParams?.get('tab') ?? 'overview';
  const urlHub = activeHubFromParams(urlTabRaw);
  const activeHub: ProjectHubKey = tabs.includes(urlHub) ? urlHub : serverActiveHub;

  return (
    <ProjectTabsEnhancerChrome tabs={tabs} activeHub={activeHub}>
      {children}
    </ProjectTabsEnhancerChrome>
  );
}

function ProjectTabsEnhancerChrome({
  tabs,
  activeHub,
  children,
}: {
  tabs: readonly ProjectHubKey[];
  activeHub: ProjectHubKey;
  children: ReactNode;
}) {
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const { displayTab, isPending, navigateTab } = useQueryTabPending(activeHub);
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
      const hub = button.dataset.tab as ProjectHubKey | undefined;
      if (!hub || !tabs.includes(hub)) continue;

      const selected = displayTab === hub;
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

    function softNavigate(hub: string) {
      navigateTabRef.current(hub, () => {
        const params = new URLSearchParams();
        if (hub !== 'overview') {
          params.set('tab', defaultSectionForHub(hub as ProjectHubKey));
        }
        const query = params.toString();
        const path = pathnameRef.current;
        router.replace(query ? `${path}?${query}` : path);
      });
    }

    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest?.('[role="tab"][data-tab]');
      if (!target || !root!.contains(target)) return;
      const hub = (target as HTMLElement).dataset.tab;
      if (!hub || !tabsRef.current.includes(hub as ProjectHubKey)) return;
      if ((target as HTMLElement).getAttribute('aria-disabled') === 'true') {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      softNavigate(hub);
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
      const hub = next?.dataset.tab;
      if (!hub) return;
      next.focus();
      softNavigate(hub);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);

    const prefetched = new Set<string>();
    function hubHref(hub: string) {
      const params = new URLSearchParams();
      if (hub !== 'overview') {
        params.set('tab', defaultSectionForHub(hub as ProjectHubKey));
      }
      const query = params.toString();
      const path = pathnameRef.current;
      return query ? `${path}?${query}` : path;
    }
    function prefetchHub(hub: string) {
      if (HUB_PREFETCH_SKIP.has(hub as ProjectHubKey)) return;
      if (prefetched.has(hub)) return;
      prefetched.add(hub);
      void router.prefetch?.(hubHref(hub));
    }
    function onPointerOver(event: Event) {
      const target = (event.target as HTMLElement | null)?.closest?.('[role="tab"][data-tab]');
      if (!target || !root!.contains(target)) return;
      const hub = (target as HTMLElement).dataset.tab;
      if (hub) prefetchHub(hub);
    }
    function onFocusIn(event: Event) {
      onPointerOver(event);
    }

    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('focusin', onFocusIn);

    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('focusin', onFocusIn);
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
