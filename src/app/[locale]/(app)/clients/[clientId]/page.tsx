import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { getClientById } from '@/modules/clients';
import { ClientsOrgDetailPage } from '@/modules/clients/ui/clients-org-detail-page';

interface ClientPageProps {
  params: Promise<{ locale: string; clientId: string }>;
}

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { clientId, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'clients' });
  try {
    const client = await withOrgContext((context) => getClientById(context, clientId));
    return { title: client.name };
  } catch {
    return { title: t('detail.title') };
  }
}

export default async function ClientPage({
  params,
  searchParams,
}: ClientPageProps & { searchParams: Promise<{ tab?: string }> }) {
  const { clientId, locale } = await params;
  const { tab } = await searchParams;
  return (
    <ClientsOrgDetailPage
      clientId={clientId}
      routeBase="/clients"
      surface="owner"
      locale={locale}
      tabParam={tab}
    />
  );
}
