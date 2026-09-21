import { ClientsOrgListView } from '@/modules/clients/ui/clients-org-list-view';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    includeArchived?: string;
    clientTypeId?: string;
    page?: string;
  }>;
}

export default async function EmployeeClientsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <ClientsOrgListView
      routeBase="/employee/clients"
      surface="employee"
      showSavedViews={false}
      searchParams={params}
    />
  );
}
