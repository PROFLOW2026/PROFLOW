import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectTabsEnhancer } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-enhancer';
import { ProjectTabsList } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-list';
import type { ProjectHubKey } from '@/app/[locale]/(app)/projects/[projectId]/project-hub-order';
import { useQueryTabPending } from '@/components/patterns/query-tab-pending';
import enCommon from '@/locales/en/common.json';
import enProjects from '@/locales/en/projects.json';

const navState = vi.hoisted(() => ({
  pathname: '/projects/proj-1',
  replace: vi.fn(),
}));

const searchTab = vi.hoisted(() => ({ value: 'work' as string | null }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'tab' ? searchTab.value : null),
  }),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ replace: navState.replace }),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/i18n/direction', () => ({
  useLocaleDir: () => 'ltr' as const,
}));

const HUB_LABELS: Partial<Record<ProjectHubKey, string>> = {
  money: 'Money',
  work: 'Work',
  documents: 'Files',
  infra: 'Infrastructure',
  details: 'Details',
};

function Shell({
  tabs,
  activeHub,
  children,
}: {
  tabs: readonly ProjectHubKey[];
  activeHub: ProjectHubKey;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 max-w-full" dir="ltr">
      <ProjectTabsList
        tabs={tabs}
        activeHub={activeHub}
        labels={HUB_LABELS}
        projectHref="/projects/proj-1"
      />
      <ProjectTabsEnhancer tabs={tabs} serverActiveHub={activeHub} activeHub={activeHub}>
        {children}
      </ProjectTabsEnhancer>
    </div>
  );
}

function renderWithMessages(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{ common: enCommon, projects: enProjects }}
        timeZone="Asia/Jerusalem"
      >
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

describe('useQueryTabPending', () => {
  it('optimistically switches displayTab and marks pending on navigate', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: string }) => useQueryTabPending(active),
      { initialProps: { active: 'overview' } },
    );

    expect(result.current.displayTab).toBe('overview');
    expect(result.current.isPending).toBe(false);

    const navigate = vi.fn();
    act(() => {
      result.current.navigateTab('money', navigate);
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(result.current.displayTab).toBe('money');
    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.navigateTab('money', navigate);
    });
    expect(navigate).toHaveBeenCalledTimes(1);

    rerender({ active: 'money' });
    expect(result.current.displayTab).toBe('money');
    expect(result.current.isPending).toBe(false);
  });

  it('ignores navigate to the already displayed tab', () => {
    const { result } = renderHook(() => useQueryTabPending('work'));
    const navigate = vi.fn();
    act(() => {
      result.current.navigateTab('work', navigate);
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('ProjectTabsShell pending behavior', () => {
  beforeEach(() => {
    navState.pathname = '/projects/proj-1';
    navState.replace.mockReset();
    searchTab.value = 'work';
  });

  it('shows a panel skeleton and pending tab chrome while soft-navigating', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithMessages(
      <Shell tabs={['money', 'work', 'details']} activeHub="work">
        <div>Work body</div>
      </Shell>,
    );

    expect(screen.getByText('Work body')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Money' }));

    expect(navState.replace).toHaveBeenCalledWith('/projects/proj-1', { scroll: false });
    expect(screen.queryByText('Work body')).toBeNull();
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-busy', 'true');

    const moneyTab = screen.getByRole('tab', { name: /Money/ });
    expect(moneyTab).toHaveAttribute('data-pending', '');

    searchTab.value = null;
    rerender(
      <Shell tabs={['money', 'work', 'details']} activeHub="money">
        <div>Money body</div>
      </Shell>,
    );

    expect(screen.getByText('Money body')).toBeVisible();
    expect(screen.getByRole('tablist')).not.toHaveAttribute('aria-busy');
  });

  it('clears the tab query when returning to the money hub', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <Shell tabs={['money', 'work']} activeHub="work">
        <div>Work body</div>
      </Shell>,
    );

    await user.click(screen.getByRole('tab', { name: 'Money' }));
    expect(navState.replace).toHaveBeenCalledWith('/projects/proj-1', { scroll: false });
  });
});
