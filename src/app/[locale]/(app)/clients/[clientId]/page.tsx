import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getClientById } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { withOrgContext } from '@/shared/auth/session';
import { ClientDetailView } from './client-detail-view';

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

export default async function ClientPage({ params }: ClientPageProps) {
  const { clientId } = await params;
  const t = await getTranslations('clients.detail');

  let client;
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let documentsPanel: Awaited<ReturnType<typeof getEntityDocumentPanelData>> | null = null;
  try {
    const loaded = await withOrgContext(async (context) => {
      const detail = await getClientById(context, clientId);
      const [fields, panel] = await Promise.all([
        listCustomFieldValuesForEntity(context, 'client', clientId).catch(() => []),
        getEntityDocumentPanelData(context, 'client', clientId),
      ]);
      return { detail, fields, panel };
    });
    client = loaded.detail;
    customFields = loaded.fields;
    documentsPanel = loaded.panel;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={client.name} description={t('title')} />
      <ClientDetailView client={client} customFields={customFields} />
      {documentsPanel ? (
        <DocumentAttachments
          ownerType="client"
          ownerId={client.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      ) : null}
    </div>
  );
}
