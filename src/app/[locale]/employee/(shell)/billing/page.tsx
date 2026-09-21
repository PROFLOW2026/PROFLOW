import { BillingOrgHubView } from '@/modules/billing/ui/billing-org-hub-view';

export default async function EmployeeBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    filter?: string;
    contractId?: string;
    fromDate?: string;
    toDate?: string;
    paymentFrom?: string;
    paymentTo?: string;
    page?: string;
  }>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  return (
    <BillingOrgHubView
      routeBase="/employee/billing"
      surface="employee"
      locale={locale}
      searchParams={search}
    />
  );
}
