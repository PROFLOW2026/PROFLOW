import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionNavLink } from '@/components/ui/section-nav-link';
import { renderWithIntl } from './test-utils';

const navState = vi.hoisted(() => ({
  pathname: '/procurement',
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

describe('SectionNavLink pending feedback', () => {
  beforeEach(() => {
    navState.pathname = '/procurement';
    navState.linkPending = false;
  });

  it('marks a non-active section link busy on first click', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <SectionNavLink href="/procurement/ap" active={false}>
        AP
      </SectionNavLink>,
      { locale: 'en' },
    );

    const link = screen.getByRole('link', { name: /AP/ });
    await user.click(link);
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('data-pending', '');
  });

  it('blocks duplicate clicks while pending', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithIntl(
      <SectionNavLink href="/procurement/rfqs" active={false} onNavigate={onNavigate}>
        RFQs
      </SectionNavLink>,
      { locale: 'en' },
    );

    const link = screen.getByRole('link', { name: /RFQs/ });
    await user.click(link);
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
