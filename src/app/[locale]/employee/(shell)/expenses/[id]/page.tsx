import { ExpensesOrgDetailPage } from '@/modules/expenses/ui/expenses-org-detail-page';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmployeeExpenseDetailPage({ params, searchParams }: PageProps) {
  const [{ id: expenseId }, rawSearchParams] = await Promise.all([params, searchParams]);
  return (
    <ExpensesOrgDetailPage
      expenseId={expenseId}
      routeBase="/employee/expenses"
      surface="employee"
      searchParams={rawSearchParams}
    />
  );
}
