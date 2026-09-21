import { BillingOrgAllocateView } from '@/modules/billing/ui/billing-org-allocate-view';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmployeeAllocatePaymentPage({ params }: PageProps) {
  const { id: paymentId } = await params;
  return (
    <BillingOrgAllocateView
      paymentId={paymentId}
      routeBase="/employee/billing"
      surface="employee"
    />
  );
}
