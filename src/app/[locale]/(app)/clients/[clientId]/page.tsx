import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getClientById } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
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
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  try {
    const loaded = await withOrgContext(async (context) => {
      const detail = await getClientById(context, clientId);
      const fields = await listCustomFieldValuesForEntity(context, 'client', clientId).catch(
        () => [],
      );
      return { detail, fields };
    });
    client = loaded.detail;
    customFields = loaded.fields;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={client.name} description={t('title')} />
      <ClientDetailView client={client} customFields={customFields} />
    </div>
  );
}
