import { ContractsOrgListView } from '@/modules/commercial/ui/contracts-org-list-view';

export default function EmployeeContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    clientId?: string;
    projectId?: string;
  }>;
}) {
  return (
    <ContractsOrgListView
      routeBase="/employee/contracts"
      surface="employee"
      searchParams={searchParams}
    />
  );
}
