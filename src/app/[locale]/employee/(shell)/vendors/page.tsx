import { VendorsOrgListView } from '@/modules/vendors/ui/vendors-org-list-view';

export default function EmployeeVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    categoryId?: string;
    page?: string;
  }>;
}) {
  return (
    <VendorsOrgListView routeBase="/employee/vendors" surface="employee" searchParams={searchParams} />
  );
}
