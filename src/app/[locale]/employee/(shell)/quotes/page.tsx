import { QuotesOrgListView } from '@/modules/quotes/ui/quotes-org-list-view';

export default function EmployeeQuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <QuotesOrgListView routeBase="/employee/quotes" surface="employee" searchParams={searchParams} />
  );
}
