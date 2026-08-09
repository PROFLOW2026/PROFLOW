import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getClientById } from '@/modules/clients';
import { withOrgContext } from '@/shared/auth/session';
import { ClientDetailView } from './client-detail-view';

interface ClientPageProps {
  params: Promise<{ locale: string; clientId: string }>;
}

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { clientId } = await params;
  try {
    const client = await withOrgContext((context) => getClientById(context, clientId));
    return { title: client.name };
  } catch {
    return { title: 'Client' };
  }
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { clientId } = await params;
  const t = await getTranslations('clients.detail');

  let client;
  try {
    client = await withOrgContext((context) => getClientById(context, clientId));
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={client.name} description={t('title')} />
      <ClientDetailView client={client} />
    </div>
  );
}
