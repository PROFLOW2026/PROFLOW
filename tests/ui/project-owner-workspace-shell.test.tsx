import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectOwnerWorkspaceShell,
  resolveProjectOwnerWorkspaceMode,
} from '@/app/[locale]/(app)/projects/[projectId]/project-owner-workspace-shell';
import { EXECUTION_HUB_KEYS } from '@/modules/project-workspace/domain/execution-hubs';
import { PROJECT_WORK_NAV_LINKS } from '@/modules/project-workspace/domain/project-work-nav-links';

const navState = vi.hoisted(() => ({
  pathname: '/he-IL/projects/proj-1',
}));

vi.mock('@/shared/i18n/navigation', () => ({
  usePathname: () => navState.pathname,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/app/[locale]/(app)/projects/[projectId]/project-commercial-tab-frame', () => ({
  ProjectCommercialTabFrame: ({ children }: { children: ReactNode }) => (
    <div data-testid="commercial-tabs">{children}</div>
  ),
}));

vi.mock('@/app/[locale]/(app)/projects/[projectId]/tab-panel-skeleton', () => ({
  TabPanelSkeleton: () => <div data-testid="tab-skeleton" />,
}));

const projectId = 'proj-1';

describe('resolveProjectOwnerWorkspaceMode', () => {
  it('classifies commercial, work, and execution paths', () => {
    expect(resolveProjectOwnerWorkspaceMode('/he-IL/projects/proj-1', projectId)).toBe('commercial');
    expect(resolveProjectOwnerWorkspaceMode('/he-IL/projects/proj-1/tasks', projectId)).toBe('work');
    expect(resolveProjectOwnerWorkspaceMode('/he-IL/projects/proj-1/execution', projectId)).toBe(
      'execution',
    );
  });
});

describe('ProjectOwnerWorkspaceShell client navigation', () => {
  beforeEach(() => {
    navState.pathname = '/he-IL/projects/proj-1';
  });

  function shell(pathname: string) {
    navState.pathname = pathname;
    return render(
      <ProjectOwnerWorkspaceShell
        projectId={projectId}
        dir="rtl"
        commercialTop={<div data-testid="commercial-top">commercial</div>}
        workChrome={<div data-testid="work-chrome">work</div>}
        executionChrome={<div data-testid="execution-chrome">execution</div>}
        tabs={['overview']}
        tabLabels={{ overview: 'Overview' }}
      >
        <div data-testid="page-body">body</div>
      </ProjectOwnerWorkspaceShell>,
    );
  }

  it('shows commercial chrome on project home', () => {
    shell('/he-IL/projects/proj-1');
    expect(screen.getByTestId('commercial-top')).toBeInTheDocument();
    expect(screen.getByTestId('commercial-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('work-chrome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('execution-chrome')).not.toBeInTheDocument();
  });

  it('switches to work chrome without reload when pathname changes to tasks', () => {
    const { rerender } = shell('/he-IL/projects/proj-1');
    navState.pathname = '/he-IL/projects/proj-1/tasks';
    rerender(
      <ProjectOwnerWorkspaceShell
        projectId={projectId}
        dir="rtl"
        commercialTop={<div data-testid="commercial-top">commercial</div>}
        workChrome={<div data-testid="work-chrome">work</div>}
        executionChrome={<div data-testid="execution-chrome">execution</div>}
        tabs={['overview']}
        tabLabels={{ overview: 'Overview' }}
      >
        <div data-testid="page-body">body</div>
      </ProjectOwnerWorkspaceShell>,
    );
    expect(screen.getByTestId('work-chrome')).toBeInTheDocument();
    expect(screen.queryByTestId('commercial-top')).not.toBeInTheDocument();
    expect(screen.queryByTestId('commercial-tabs')).not.toBeInTheDocument();
  });

  it('switches between work and execution chrome', () => {
    const props = {
      projectId,
      dir: 'rtl' as const,
      commercialTop: <div data-testid="commercial-top">commercial</div>,
      workChrome: <div data-testid="work-chrome">work</div>,
      executionChrome: <div data-testid="execution-chrome">execution</div>,
      tabs: ['overview'] as const,
      tabLabels: { overview: 'Overview' },
      children: <div data-testid="page-body">body</div>,
    };

    navState.pathname = '/he-IL/projects/proj-1/tasks';
    const { rerender } = render(<ProjectOwnerWorkspaceShell {...props} />);
    expect(screen.getByTestId('work-chrome')).toBeInTheDocument();

    navState.pathname = '/he-IL/projects/proj-1/execution';
    rerender(<ProjectOwnerWorkspaceShell {...props} />);
    expect(screen.getByTestId('execution-chrome')).toBeInTheDocument();
    expect(screen.queryByTestId('work-chrome')).not.toBeInTheDocument();
  });
});

describe('nav inventory (owner surfaces)', () => {
  it('keeps six task actions and seven execution hubs defined', () => {
    expect(PROJECT_WORK_NAV_LINKS).toHaveLength(6);
    expect(EXECUTION_HUB_KEYS).toHaveLength(7);
  });
});
