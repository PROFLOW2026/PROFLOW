import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heExpenses from '@/locales/he-IL/expenses.json';
import { ExpensesList } from '@/app/[locale]/(app)/expenses/expenses-list';
import type { ExpenseSummary } from '@/modules/expenses/domain/types';
import { renderWithIntl } from './test-utils';

const pushMock = vi.fn();
const pathnameMock = vi.fn(() => '/expenses');
const searchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathnameMock(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

const finalizedExpense: ExpenseSummary = {
  id: 'exp-unallocated-1',
  expenseDate: '2026-01-15' as never,
  description: 'Office supplies',
  supplierName: 'Supplier Co',
  vendorId: null,
  vendorName: null,
  projectId: null,
  projectName: null,
  workPackageId: null,
  costFamily: 'shared',
  costCategoryId: 'cat-1',
  classificationStatus: 'classified',
  grossAmount: { amount: '500', currency: 'ILS' },
  netAmount: { amount: '423.73', currency: 'ILS' },
  taxAmount: { amount: '76.27', currency: 'ILS' },
  status: 'finalized',
  voidsExpenseId: null,
  needsProjectAllocation: true,
};

const cleanExpense: ExpenseSummary = {
  ...finalizedExpense,
  id: 'exp-clean-1',
  needsProjectAllocation: false,
  projectId: 'project-1',
  projectName: 'Tower A',
};

const voidedExpense: ExpenseSummary = {
  ...finalizedExpense,
  id: 'exp-void-1',
  status: 'void',
  needsProjectAllocation: true,
};

const reversalExpense: ExpenseSummary = {
  ...finalizedExpense,
  id: 'exp-reversal-1',
  voidsExpenseId: 'exp-original',
  description: 'Reversal: Office supplies',
  needsProjectAllocation: true,
};

const defaultListProps = {
  currentPage: 1,
  pageCount: 1,
  pageSize: 50,
  attentionCount: 0,
};

describe('ExpensesList attention filter visibility', () => {
  it('shows visible labels above every filter control in Hebrew', () => {
    renderWithIntl(
      <ExpensesList
        {...defaultListProps}
        items={[]}
        total={0}
        projects={[]}
        categories={[]}
        locale="he-IL"
        initialFilters={{ dateFrom: '2026-01-01' }}
      />,
      { locale: 'he-IL', messages: { expenses: heExpenses, status: { expense: {} } } },
    );

    expect(screen.getByText(heExpenses.filters.dateFrom)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.filters.dateTo)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.filters.project)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.filters.family)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.filters.category)).toBeInTheDocument();
    expect(screen.getByText(heExpenses.filters.status)).toBeInTheDocument();
    expect(screen.queryByText(heExpenses.filters.attention)).not.toBeInTheDocument();
  });

  it('shows active attention chip, row label, and allocation action for unallocated deep link', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('unallocated=true'));
    renderWithIntl(
      <ExpensesList
        {...defaultListProps}
        items={[finalizedExpense]}
        total={1}
        projects={[]}
        categories={[]}
        locale="he-IL"
        initialFilters={{ statusFilter: 'project_allocation' }}
      />,
      {
        locale: 'he-IL',
        messages: {
          expenses: heExpenses,
          status: { expense: { finalized: 'סגור' } },
        },
      },
    );

    expect(screen.getByRole('status')).toHaveTextContent(heExpenses.filters.attentionActiveLabel);
    expect(screen.getByRole('status')).toHaveTextContent(
      heExpenses.attention.options.project_allocation,
    );

    expect(screen.getAllByText(heExpenses.list.actionRequired).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(heExpenses.attention.required.project_allocation).length,
    ).toBeGreaterThan(0);

    const actionLinks = screen.getAllByRole('link', { name: heExpenses.attention.rowAction });
    expect(actionLinks.length).toBeGreaterThanOrEqual(1);
    expect(actionLinks[0]).toHaveAttribute(
      'href',
      '/expenses/exp-unallocated-1?focus=allocation&returnTo=%2Fexpenses%3Funallocated%3Dtrue',
    );
  });

  it('shows mobile card action required line for unallocated rows', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('unallocated=true'));
    renderWithIntl(
      <ExpensesList
        {...defaultListProps}
        items={[finalizedExpense]}
        total={1}
        projects={[]}
        categories={[]}
        locale="he-IL"
        initialFilters={{ statusFilter: 'project_allocation' }}
      />,
      {
        locale: 'he-IL',
        messages: {
          expenses: heExpenses,
          status: { expense: { finalized: 'סגור' } },
        },
      },
    );

    const actionLinks = screen.getAllByRole('link', { name: heExpenses.attention.rowAction });
    expect(actionLinks.some((link) => link.getAttribute('href')?.includes('focus=allocation'))).toBe(
      true,
    );

    expect(screen.getByText(`${heExpenses.list.actionRequired}:`)).toBeInTheDocument();
  });

  it('marks actionable rows on the general list with compact badges and summary strip', () => {
    pushMock.mockClear();

    renderWithIntl(
      <ExpensesList
        {...defaultListProps}
        attentionCount={1}
        items={[finalizedExpense, cleanExpense]}
        total={2}
        projects={[]}
        categories={[]}
        locale="he-IL"
        initialFilters={{}}
      />,
      {
        locale: 'he-IL',
        messages: {
          expenses: heExpenses,
          status: { expense: { finalized: 'סגור' } },
        },
      },
    );

    expect(screen.getAllByText(heExpenses.attention.compact.project_allocation).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(heExpenses.attention.rowAction)).not.toBeInTheDocument();
    expect(screen.queryByText(heExpenses.list.actionRequired)).not.toBeInTheDocument();

    const summary = screen.getByRole('button', {
      name: '1 הוצאה דורשת טיפול',
    });
    fireEvent.click(summary);
    expect(pushMock).toHaveBeenCalledWith('/expenses?unallocated=true');
  });

  it('does not show attention badges on voided or reversal rows in the general list', () => {
    renderWithIntl(
      <ExpensesList
        {...defaultListProps}
        items={[voidedExpense, reversalExpense, cleanExpense]}
        total={3}
        projects={[]}
        categories={[]}
        locale="he-IL"
        initialFilters={{}}
      />,
      {
        locale: 'he-IL',
        messages: {
          expenses: heExpenses,
          status: { expense: { finalized: 'נרשמה', void: 'מבוטל' } },
        },
      },
    );

    expect(screen.queryByText(heExpenses.attention.compact.project_allocation)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /דורשות טיפול/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('מבוטל').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/קיזוז:/).length).toBeGreaterThan(0);
  });
});
