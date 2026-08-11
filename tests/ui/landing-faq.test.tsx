import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LandingFaq } from '@/modules/marketing/ui/landing-faq';
import heMarketing from '@/locales/he-IL/marketing.json';
import { renderWithIntl } from './test-utils';

describe('LandingFaq', () => {
  const groups = heMarketing.faq.groups;
  const firstItem = groups[0]!.items[0]!;

  it('groups questions into four topics and keeps answers collapsed', () => {
    renderWithIntl(<LandingFaq />, { locale: 'he-IL', messages: { marketing: heMarketing } });

    expect(screen.getByRole('heading', { name: heMarketing.faq.title })).toBeVisible();
    for (const group of groups) {
      expect(screen.getByRole('tab', { name: group.title })).toBeVisible();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    const first = screen.getByRole('button', { name: firstItem.q });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(firstItem.a)).not.toBeVisible();
  });

  it('expands one answer with keyboard and keeps OCR/portal/Gantt off the homepage FAQ', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingFaq />, { locale: 'he-IL', messages: { marketing: heMarketing } });

    const first = screen.getByRole('button', { name: firstItem.q });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    first.focus();
    expect(first).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(firstItem.a)).toBeVisible();

    const second = screen.getByRole('button', { name: groups[0]!.items[1]!.q });
    await user.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveAttribute('aria-expanded', 'false');

    expect(screen.queryByText(/OCR/i)).toBeNull();
    expect(screen.queryByText(/פורטל לקוחות/)).toBeNull();
    expect(screen.queryByText(/Gantt/i)).toBeNull();
  });

  it('switches topic tabs and collapses the previous answer', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingFaq />, { locale: 'he-IL', messages: { marketing: heMarketing } });

    await user.click(screen.getByRole('button', { name: firstItem.q }));
    expect(screen.getByText(firstItem.a)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: groups[1]!.title }));
    expect(screen.getByRole('tab', { name: groups[1]!.title })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: groups[1]!.items[0]!.q })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: firstItem.q })).toBeNull();
  });
});
