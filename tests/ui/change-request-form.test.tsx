import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { ChangeRequestForm } from '@/modules/commercial/ui/change-request-form';
import enChanges from '@/locales/en/changes.json';
import enCommon from '@/locales/en/common.json';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const noopAction = vi.fn(async (state: { error?: string }) => state);

function renderForm(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{ changes: enChanges, common: enCommon }}
        timeZone="Asia/Jerusalem"
      >
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

describe('ChangeRequestForm project picker', () => {
  it('shows a project select instead of a UUID text field when no project is in scope', () => {
    const projects = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Tower A' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Renovation B' },
    ];

    renderForm(<ChangeRequestForm action={noopAction} projects={projects} />);

    expect(screen.queryByPlaceholderText('Select a project')).toBeNull();
    expect(screen.getByLabelText(/^Project/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Project/ })).toBeNull();
  });

  it('hides the project field when projectId is already provided', () => {
    renderForm(
      <ChangeRequestForm
        action={noopAction}
        projectId="11111111-1111-4111-8111-111111111111"
        projects={[{ id: '11111111-1111-4111-8111-111111111111', name: 'Tower A' }]}
      />,
    );

    expect(screen.queryByLabelText(/^Project/)).toBeNull();
  });
});
