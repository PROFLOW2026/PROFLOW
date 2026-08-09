import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellNavLink } from '@/components/shell/shell-nav-link';
import { renderWithIntl } from './test-utils';

const navState = vi.hoisted(() => ({
  pathname: '/projects',
  linkPending: false,
}));

vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: navState.linkPending }),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  usePathname: () => navState.pathname,
  Link: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  } & Record<string, unknown>) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

describe('ShellNavLink pending feedback', () => {
  beforeEach(() => {
    navState.pathname = '/projects';
    navState.linkPending = false;
  });

  it('marks the link busy and announces navigating on the first click', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ShellNavLink
        href="/"
        label="Dashboard"
        iconKey="dashboard"
        active={false}
        variant="sidebar"
      />,
      { locale: 'en' },
    );

    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).not.toHaveAttribute('aria-busy');
    expect(link).not.toHaveAttribute('data-pending');

    await user.click(link);

    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('data-pending', '');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Navigating')).toHaveClass('sr-only');
  });

  it('ignores duplicate clicks while the same navigation is pending', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithIntl(
      <ShellNavLink
        href="/"
        label="לוח בקרה"
        iconKey="dashboard"
        active={false}
        variant="mobile"
        onNavigate={onNavigate}
      />,
    );

    const link = screen.getByRole('link', { name: /לוח בקרה/ });
    await user.click(link);
    await user.click(link);
    await user.click(link);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('מעבר לדף')).toHaveClass('sr-only');
  });

  it('exposes aria-current on the active route without entering a pending state', async () => {
    const user = userEvent.setup();
    navState.pathname = '/projects';
    renderWithIntl(
      <ShellNavLink
        href="/projects"
        label="Projects"
        iconKey="projects"
        active
        variant="sidebar"
      />,
      { locale: 'en' },
    );

    const link = screen.getByRole('link', { name: 'Projects' });
    expect(link).toHaveAttribute('aria-current', 'page');

    await user.click(link);

    expect(link).not.toHaveAttribute('aria-busy');
    expect(link).not.toHaveAttribute('data-pending');
  });

  it('also treats Next.js useLinkStatus pending as busy chrome', () => {
    navState.linkPending = true;
    renderWithIntl(
      <ShellNavLink
        href="/reports"
        label="Reports"
        iconKey="reports"
        active={false}
        variant="sidebar"
      />,
      { locale: 'en' },
    );

    // useLinkStatus alone drives the spinner + sr-only; clickPending sets aria-busy on the link.
    expect(screen.getByText('Navigating')).toHaveClass('sr-only');
  });
});
