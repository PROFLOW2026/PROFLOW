import { BillingOrgDetailView } from '@/modules/billing/ui/billing-org-detail-view';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ paymentRecorded?: string; paymentId?: string }>;
}

export default async function EmployeeBillingDetailPage({ params, searchParams }: PageProps) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  return (
    <BillingOrgDetailView
      billingRecordId={id}
      routeBase="/employee/billing"
      surface="employee"
      locale={locale}
      searchParams={query}
    />
  );
}
