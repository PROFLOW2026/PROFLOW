import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import heExpenses from '@/locales/he-IL/expenses.json';
import { ExpenseDetailAttentionPanel } from '@/modules/expenses/ui/expense-detail-attention-panel';
import { renderWithIntl } from './test-utils';

describe('ExpenseDetailAttentionPanel', () => {
  it('shows Hebrew allocation reason, explanation, and a direct action', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel issues={['project_allocation']} />, {
      locale: 'he-IL',
      messages: { expenses: heExpenses },
    });

    expect(
      screen.getByText(heExpenses.detail.attention.project_allocation.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(heExpenses.detail.attention.project_allocation.explain),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: heExpenses.attention.rowAction }),
    ).toBeInTheDocument();
  });

  it('shows classification message and a choose-category action', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel issues={['classification']} />, {
      locale: 'he-IL',
      messages: { expenses: heExpenses },
    });

    expect(
      screen.getByText(heExpenses.detail.attention.classification.title),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: heExpenses.attention.chooseCategory }),
    ).toBeInTheDocument();
  });

  it('shows approval message and a direct action', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel issues={['approval']} />, {
      locale: 'he-IL',
      messages: { expenses: heExpenses },
    });

    expect(screen.getByText(heExpenses.detail.attention.approval.title)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: heExpenses.attention.rowAction }),
    ).toBeInTheDocument();
  });

  it('lists every issue when more than one needs treatment', () => {
    renderWithIntl(
      <ExpenseDetailAttentionPanel issues={['approval', 'classification']} />,
      {
        locale: 'he-IL',
        messages: { expenses: heExpenses },
      },
    );

    expect(screen.getByText(heExpenses.detail.attention.issuesTitle)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.detail.attention.approval.explain)).toBeInTheDocument();
    expect(
      screen.getByText(heExpenses.detail.attention.classification.explain),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: heExpenses.attention.chooseCategory }),
    ).toBeInTheDocument();
  });

  it('renders as a compact status box suitable for mobile and RTL', () => {
    const { container } = renderWithIntl(
      <ExpenseDetailAttentionPanel issues={['project_allocation']} />,
      {
        locale: 'he-IL',
        messages: { expenses: heExpenses },
      },
    );

    const panel = container.querySelector('#expense-detail-attention');
    expect(panel).toHaveAttribute('role', 'status');
    expect(document.querySelector('[dir="rtl"][lang="he"]')).not.toBeNull();
  });
});
