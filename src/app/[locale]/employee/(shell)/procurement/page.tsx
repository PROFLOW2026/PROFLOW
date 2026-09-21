import { ProcurementOrdersOrgListView } from '@/modules/procurement/ui/procurement-orders-org-list-view';

export default function EmployeeProcurementPage() {
  return (
    <ProcurementOrdersOrgListView routeBase="/employee/procurement" surface="employee" />
  );
}
