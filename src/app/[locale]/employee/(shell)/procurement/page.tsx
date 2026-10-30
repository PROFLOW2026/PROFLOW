import { ProcurementOrdersOrgListView } from '@/modules/procurement/ui/procurement-orders-org-list-view';

export default function EmployeeProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ProcurementOrdersOrgListView
      routeBase="/employee/procurement"
      surface="employee"
      searchParams={searchParams}
    />
  );
}
