import { ApBillsOrgListView } from '@/modules/ap/ui/ap-bills-org-list-view';

export default function EmployeeApPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ApBillsOrgListView routeBase="/employee/ap" surface="employee" searchParams={searchParams} />
  );
}
