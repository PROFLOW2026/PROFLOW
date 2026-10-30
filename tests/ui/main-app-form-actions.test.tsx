import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MainAppFormActions } from '@/components/patterns/main-app/main-app-form-actions';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('MainAppFormActions', () => {
  it('renders cancel link and submit control', () => {
    render(
      <MainAppFormActions
        cancelHref="/crm"
        cancelLabel="Cancel"
        submitLabel="Save"
        submitLoading={false}
      />,
    );

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/crm');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('calls onCancel for button cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <MainAppFormActions
        onCancel={onCancel}
        cancelLabel="Cancel"
        submitLabel="Save"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('marks submit loading and disables cancel', () => {
    render(
      <MainAppFormActions
        cancelHref="/vendors"
        cancelLabel="Cancel"
        submitLabel="Save"
        submitLoading
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
