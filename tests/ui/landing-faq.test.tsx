import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LandingFaq } from '@/modules/marketing/ui/landing-faq';
import heMarketing from '@/locales/he-IL/marketing.json';
import { renderWithIntl } from './test-utils';

describe('LandingFaq', () => {
  it('expands answers with keyboard and keeps OCR/portal/Gantt off the homepage FAQ', async () => {
    const user = userEvent.setup();
    const firstItem = heMarketing.faq.items[0]!;
    renderWithIntl(<LandingFaq />, { locale: 'he-IL', messages: { marketing: heMarketing } });

    const first = screen.getByRole('button', { name: firstItem.q });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(firstItem.a)).toBeVisible();

    expect(screen.queryByText(/OCR/i)).toBeNull();
    expect(screen.queryByText(/פורטל לקוחות/)).toBeNull();
    expect(screen.queryByText(/Gantt/i)).toBeNull();
  });
});
