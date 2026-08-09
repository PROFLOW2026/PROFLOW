import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectTabsShell } from '@/app/[locale]/(app)/projects/[projectId]/project-tabs-shell';
import { useQueryTabPending } from '@/components/patterns/query-tab-pending';
import enCommon from '@/locales/en/common.json';
import enProjects from '@/locales/en/projects.json';

const navState = vi.hoisted(() => ({
  pathname: '/projects/proj-1',
  replace: vi.fn(),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ replace: navState.replace }),
}));

vi.mock('@/shared/i18n/direction', () => ({
  useLocaleDir: () => 'ltr' as const,
}));

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
      result.current.navigateTab('financials', navigate);
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(result.current.displayTab).toBe('financials');
    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.navigateTab('financials', navigate);
    });
    expect(navigate).toHaveBeenCalledTimes(1);

    rerender({ active: 'financials' });
    expect(result.current.displayTab).toBe('financials');
    expect(result.current.isPending).toBe(false);
  });

  it('ignores navigate to the already displayed tab', () => {
    const { result } = renderHook(() => useQueryTabPending('expenses'));
    const navigate = vi.fn();
    act(() => {
      result.current.navigateTab('expenses', navigate);
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('ProjectTabsShell pending behavior', () => {
  beforeEach(() => {
    navState.pathname = '/projects/proj-1';
    navState.replace.mockReset();
  });

  it('shows a panel skeleton and pending tab chrome while soft-navigating', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithMessages(
      <ProjectTabsShell tabs={['overview', 'financials', 'details']} activeTab="overview">
        <div>Overview body</div>
      </ProjectTabsShell>,
    );

    expect(screen.getByText('Overview body')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Financials' }));

    expect(navState.replace).toHaveBeenCalledWith('/projects/proj-1?tab=financials');
    expect(screen.queryByText('Overview body')).toBeNull();
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-busy', 'true');

    const financialsTab = screen.getByRole('tab', { name: /Financials/ });
    expect(financialsTab).toHaveAttribute('data-pending', '');

    rerender(
      <ProjectTabsShell tabs={['overview', 'financials', 'details']} activeTab="financials">
        <div>Financials body</div>
      </ProjectTabsShell>,
    );

    expect(screen.getByText('Financials body')).toBeVisible();
    expect(screen.getByRole('tablist')).not.toHaveAttribute('aria-busy');
  });

  it('clears the tab query when returning to overview', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <ProjectTabsShell tabs={['overview', 'work']} activeTab="work">
        <div>Work body</div>
      </ProjectTabsShell>,
    );

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(navState.replace).toHaveBeenCalledWith('/projects/proj-1');
  });
});
