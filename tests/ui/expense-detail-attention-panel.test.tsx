import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import heExpenses from '@/locales/he-IL/expenses.json';
import { ExpenseDetailAttentionPanel } from '@/modules/expenses/ui/expense-detail-attention-panel';
import { renderWithIntl } from './test-utils';

describe('ExpenseDetailAttentionPanel', () => {
  it('shows Hebrew allocation reason, explanation, and action instruction', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel attention="project_allocation" />, {
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
      screen.getByText(`${heExpenses.detail.attention.actionLabel}:`, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(heExpenses.detail.attention.project_allocation.action),
    ).toBeInTheDocument();
  });

  it('shows classification message in Hebrew', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel attention="classification" />, {
      locale: 'he-IL',
      messages: { expenses: heExpenses },
    });

    expect(
      screen.getByText(heExpenses.detail.attention.classification.title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(heExpenses.detail.attention.classification.action),
    ).toBeInTheDocument();
  });

  it('shows approval message in Hebrew', () => {
    renderWithIntl(<ExpenseDetailAttentionPanel attention="approval" />, {
      locale: 'he-IL',
      messages: { expenses: heExpenses },
    });

    expect(screen.getByText(heExpenses.detail.attention.approval.title)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.detail.attention.approval.action)).toBeInTheDocument();
  });

  it('renders as a compact status box suitable for mobile and RTL', () => {
    const { container } = renderWithIntl(
      <ExpenseDetailAttentionPanel attention="project_allocation" />,
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
