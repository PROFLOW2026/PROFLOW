import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { ChangeRequestForm } from '@/modules/commercial/ui/change-request-form';
import enChanges from '@/locales/en/changes.json';
import enCommon from '@/locales/en/common.json';
import enOffline from '@/locales/en/offline.json';

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
        messages={{ changes: enChanges, common: enCommon, offline: enOffline }}
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

  it('shows a contract picker only when the project has more than one live contract', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const contracts = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        projectId,
        name: 'Main agreement',
        contractNumber: 'C-1',
        isPrimary: true,
        contractType: 'primary',
        status: 'active',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId,
        name: 'Facade package',
        contractNumber: 'C-2',
        isPrimary: false,
        contractType: 'additional',
        status: 'active',
      },
    ];

    renderForm(
      <ChangeRequestForm action={noopAction} projectId={projectId} contracts={contracts} />,
    );

    expect(screen.getByLabelText(/^Contract/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Contract/ })).toBeInTheDocument();
  });

  it('hides the contract picker when the project has a single contract', () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    renderForm(
      <ChangeRequestForm
        action={noopAction}
        projectId={projectId}
        contracts={[
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            projectId,
            name: 'Main agreement',
            contractNumber: 'C-1',
            isPrimary: true,
            contractType: 'primary',
            status: 'active',
          },
        ]}
      />,
    );

    expect(screen.queryByLabelText(/^Contract/)).toBeNull();
  });
});
