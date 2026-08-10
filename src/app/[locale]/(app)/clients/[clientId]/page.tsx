import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getClientById } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
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
  const [t, tStatus, shell] = await Promise.all([
    getTranslations('clients.detail'),
    getTranslations('status.generic'),
    getShellContext(),
  ]);
  const canManage = shell?.permissions.has(PERMISSIONS.CLIENTS_MANAGE) ?? false;

  let client;
  let linkedProjects: Array<{
    id: string;
    name: string;
    status: string;
    workKind: string;
  }> = [];
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let documentsPanel: Awaited<ReturnType<typeof getEntityDocumentPanelData>> | null = null;
  try {
    const loaded = await withOrgContext(async (context) => {
      const detail = await getClientById(context, clientId);
      const [fields, panel, projects] = await Promise.all([
        listCustomFieldValuesForEntity(context, 'client', clientId).catch(() => []),
        getEntityDocumentPanelData(context, 'client', clientId),
        listProjectsForOrg(context, { clientId, includeArchived: false }).catch(() => []),
      ]);
      return {
        detail,
        fields,
        panel,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          workKind: project.workKind,
        })),
      };
    });
    client = loaded.detail;
    customFields = loaded.fields;
    documentsPanel = loaded.panel;
    linkedProjects = loaded.projects;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        description={t('title')}
        meta={
          <StatusBadge
            shape={client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'}
            label={client.archivedAt ? t('archivedBadge') : tStatus(client.status)}
          />
        }
      />
      <ClientDetailView
        client={client}
        customFields={customFields}
        linkedProjects={linkedProjects}
        canManage={canManage}
      />
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
