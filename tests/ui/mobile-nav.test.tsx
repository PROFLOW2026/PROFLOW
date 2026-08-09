import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileNav } from '@/components/shell/mobile-nav';
import type { NavItem } from '@/components/shell/navigation';
import enNav from '@/locales/en/nav.json';
import { renderWithIntl } from './test-utils';

const navState = vi.hoisted(() => ({
  pathname: '/projects',
}));

vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
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

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockMobileNavMore({
      open,
      onOpenChange,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) {
      if (!open) return null;
      return (
        <div role="dialog" aria-labelledby="pf-mobile-nav-more-title" id="pf-mobile-nav-more">
          <h2 id="pf-mobile-nav-more-title">More</h2>
          <button type="button" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      );
    },
}));

const ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    href: '/',
    labelKey: 'dashboard',
    iconKey: 'dashboard',
    primaryOnMobile: true,
  },
  {
    key: 'projects',
    href: '/projects',
    labelKey: 'projects',
    iconKey: 'projects',
    primaryOnMobile: true,
  },
  {
    key: 'expenses',
    href: '/expenses',
    labelKey: 'expenses',
    iconKey: 'expenses',
    primaryOnMobile: true,
  },
  {
    key: 'reports',
    href: '/reports',
    labelKey: 'reports',
    iconKey: 'reports',
    primaryOnMobile: true,
  },
  {
    key: 'settings',
    href: '/settings',
    labelKey: 'settings',
    iconKey: 'settings',
  },
  {
    key: 'documents',
    href: '/documents',
    labelKey: 'documents',
    iconKey: 'documents',
    moreGroup: 'advanced',
  },
];

describe('MobileNav More interaction', () => {
  beforeEach(() => {
    navState.pathname = '/projects';
  });

  it('marks More expanded immediately on click before the sheet finishes opening', async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav items={ITEMS} />, {
      locale: 'en',
      messages: { nav: enNav },
    });

    const more = screen.getByRole('button', { name: enNav.more });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument();
    });
  });
});
