import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientsOrgListView } from '@/modules/clients/ui/clients-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('title') };
}

interface ClientsPageProps {
  searchParams: Promise<{
    q?: string;
    includeArchived?: string;
    clientTypeId?: string;
    page?: string;
  }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const params = await searchParams;
  return (
    <ClientsOrgListView
      routeBase="/clients"
      surface="owner"
      searchParams={params}
    />
  );
}
