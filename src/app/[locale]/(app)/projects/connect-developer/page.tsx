import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listFailedProvisioningMappingsForContractorOrg } from '@/modules/connected-projects';
import { ConnectDeveloperForm, ProvisioningRetryPanel } from '@/modules/connected-projects/ui';
import { acceptConnectionCodeAction, previewConnectionCodeAction, retryProvisioningAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connectedProjects');
  return { title: t('contractor.title') };
}

export default async function ConnectDeveloperProjectPage() {
  const t = await getTranslations('connectedProjects');

  const loaded = await withOrgContext(async (context) => {
    const canRedeem = context.permissions.has(PERMISSIONS.PROJECTS_CREATE);
    const failedMappings = canRedeem
      ? await listFailedProvisioningMappingsForContractorOrg(context.db, context.organizationId)
      : [];
    return { canRedeem, organizationName: context.organization.name, failedMappings };
  });

  return (
    <WithAppClientMessages extra={['connectedProjects']}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
        {loaded.failedMappings.length > 0 ? (
          loaded.failedMappings.map((mapping) => (
            <ProvisioningRetryPanel
              key={mapping.id}
              mappingId={mapping.id}
              developerProjectName={null}
              action={retryProvisioningAction}
            />
          ))
        ) : null}
        {loaded.canRedeem ? (
          <ConnectDeveloperForm
            organizationName={loaded.organizationName}
            actions={{
              preview: previewConnectionCodeAction,
              accept: acceptConnectionCodeAction,
            }}
          />
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('errors.forbidden')}</p>
        )}
      </div>
    </WithAppClientMessages>
  );
}
