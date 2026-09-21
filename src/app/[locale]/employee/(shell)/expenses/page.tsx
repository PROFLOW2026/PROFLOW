import { ExpensesOrgListPage } from '@/modules/expenses/ui/expenses-org-list-page';

export default async function EmployeeExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ExpensesOrgListPage
      routeBase="/employee/expenses"
      surface="employee"
      searchParams={searchParams}
    />
  );
}
