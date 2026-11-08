import { Suspense } from 'react';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import {
  getProjectCoverImageAvailability,
  getProjectCoverDisplayUrl,
} from '@/modules/projects';
import { ProjectContractsPanel } from '@/modules/projects/ui/project-contracts-panel';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { withProjectOrgContext } from '@/shared/auth/session';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { ProjectManagementModePanel } from '@/modules/project-profile/ui/project-management-mode-panel';
import { loadProjectDetailInContext } from './load-project-detail';
import { customFieldValuesForClient, projectDetailForClient } from './project-detail-client';
import { DetailsTab } from './details-tab';
import { TabPanelSkeleton } from './tab-panel-skeleton';

export async function ProjectDetailsWorkspace({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: string;
}) {
  return withProjectOrgContext(projectId, async (context) => {
    const can = (permission: PermissionKey) => context.permissions.has(permission);
    const canEditProjects = can(PERMISSIONS.PROJECTS_UPDATE);
    const canManageContract = can(PERMISSIONS.CONTRACTS_MANAGE);
    const isOwner = isOrganizationOwner(context);

    const detail = projectDetailForClient(
      await loadProjectDetailInContext(context, projectId, false),
    );
    const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';
    const baseCurrency =
      detail.contract?.currency ?? detail.project.currency ?? context.organization.baseCurrency ?? 'ILS';
    const sample = new Intl.NumberFormat(uiLocale, {
      style: 'currency',
      currency: baseCurrency,
      currencyDisplay: 'narrowSymbol',
    }).format(0);
    const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

    const [customFields, coverAvailability, coverPreviewUrl, clientRows] = await Promise.all([
      listCustomFieldValuesForEntity(context, 'project', projectId).catch(() => []),
      getProjectCoverImageAvailability(context).catch(() => null),
      getProjectCoverDisplayUrl(context, projectId).catch(() => null),
      listClientsForOrg(context, {}).catch(() => []),
    ]);
    const contacts = await listContactsForClients(
      context,
      clientRows.map((client) => client.id),
    ).catch(() => []);
    const contactsByClient = new Map<
      string,
      { id: string; name: string; phone: string | null; role: string }[]
    >();
    for (const contact of contacts) {
      const list = contactsByClient.get(contact.clientId) ?? [];
      list.push({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        role: contact.role,
      });
      contactsByClient.set(contact.clientId, list);
    }
    const clients = clientRows.map((client) => ({
      id: client.id,
      name: client.name,
      contacts: contactsByClient.get(client.id) ?? [],
    }));

    return (
      <>
        <ProjectManagementModePanel projectId={projectId} />
        <Suspense fallback={<TabPanelSkeleton />}>
          <DetailsTab
            detail={detail}
            clients={clients}
            baseCurrency={baseCurrency}
            currencySymbol={currencySymbol}
            canManageContract={canManageContract}
            isOwner={isOwner}
            customFields={customFieldValuesForClient(customFields)}
            taxRatePercent={detail.contract?.taxSnapshot?.ratePercent ?? null}
            coverPreviewUrl={coverPreviewUrl}
            coverSchemaReady={coverAvailability?.schemaReady ?? false}
            coverStorageConfigured={coverAvailability?.storageConfigured ?? false}
            canEditCover={canEditProjects}
          />
        </Suspense>
        {canManageContract ? (
          <div className="mt-4">
            <ProjectContractsPanel projectId={projectId} currency={baseCurrency} />
          </div>
        ) : null}
      </>
    );
  });
}
