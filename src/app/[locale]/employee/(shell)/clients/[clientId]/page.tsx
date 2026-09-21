import { ClientsOrgDetailPage } from '@/modules/clients/ui/clients-org-detail-page';

interface PageProps {
  params: Promise<{ locale: string; clientId: string }>;
}

export default async function EmployeeClientDetailPage({ params }: PageProps) {
  const { locale, clientId } = await params;
  return (
    <ClientsOrgDetailPage
      clientId={clientId}
      routeBase="/employee/clients"
      surface="employee"
      locale={locale}
    />
  );
}
