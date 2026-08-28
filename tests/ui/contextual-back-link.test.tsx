import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('ContextualBackLink', () => {
  it('renders explicit parent label and href', () => {
    renderWithIntl(
      <ContextualBackLink href="/expenses">חזרה להוצאות</ContextualBackLink>,
      { locale: 'he-IL' },
    );
    const link = screen.getByRole('link', { name: /חזרה להוצאות/ });
    expect(link).toHaveAttribute('href', '/expenses');
  });

  it('flips back chevron for RTL', () => {
    const { container } = renderWithIntl(
      <ContextualBackLink href="/recurring-drafts">
        חזרה להוצאות קבועות / חוזרות
      </ContextualBackLink>,
      { locale: 'he-IL' },
    );
    const chevron = container.querySelector('svg');
    expect(chevron?.getAttribute('class') ?? '').toContain('rtl:rotate-180');
  });

  it('uses touch-friendly min height for mobile', () => {
    renderWithIntl(
      <ContextualBackLink href="/expenses">חזרה להוצאות</ContextualBackLink>,
      { locale: 'he-IL' },
    );
    expect(screen.getByRole('link', { name: /חזרה להוצאות/ }).className).toContain('min-h-11');
  });

  it('supports origin-aware project financials href', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const href = `/projects/${projectId}?tab=financials`;
    renderWithIntl(
      <ContextualBackLink href={href}>חזרה לכספים</ContextualBackLink>,
      { locale: 'he-IL' },
    );
    expect(screen.getByRole('link', { name: /חזרה לכספים/ })).toHaveAttribute('href', href);
  });
});
