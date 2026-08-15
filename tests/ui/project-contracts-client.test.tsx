import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectContractsClient } from '@/modules/projects/ui/project-contracts-client';
import enCommon from '@/locales/en/common.json';
import enProjects from '@/locales/en/projects.json';

vi.mock('@/modules/projects/ui/contract-actions', () => ({
  createAdditionalContractAction: vi.fn(async (state: { error?: string }) => state),
  setPrimaryContractAction: vi.fn(async (state: { error?: string }) => state),
  updateContractAction: vi.fn(async (state: { error?: string }) => state),
}));

function renderClient(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{ common: enCommon, projects: enProjects }}
        timeZone="Asia/Jerusalem"
      >
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

const contracts = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Main agreement',
    contractNumber: 'C-1',
    contractType: 'primary',
    isPrimary: true,
    status: 'active',
    originalValueAmount: '100000.000000',
    currentValueAmount: '100000.000000',
    currency: 'ILS',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    retentionPercent: '5',
    notes: null,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Facade package',
    contractNumber: 'C-2',
    contractType: 'additional',
    isPrimary: false,
    status: 'active',
    originalValueAmount: '40000.000000',
    currentValueAmount: '40000.000000',
    currency: 'ILS',
    startDate: null,
    endDate: null,
    retentionPercent: null,
    notes: 'Site extra',
  },
];

describe('ProjectContractsClient edit and close', () => {
  it('shows close/cancel and opens an edit form without an original-amount field', async () => {
    const user = userEvent.setup();
    renderClient(
      <ProjectContractsClient
        projectId="11111111-1111-4111-8111-111111111111"
        currency="ILS"
        canManage
        contracts={contracts}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Cancel contract' }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!);

    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Facade package');
    expect(document.querySelector('input[name="enteredAmount"]')).toBeNull();
    expect(document.querySelector('input[name="originalValueAmount"]')).toBeNull();
    expect(screen.getByText(enProjects.contracts.amountNotEdited)).toBeInTheDocument();
  });
});
