import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { getContractorAccessOverview, loadContractorAccessAuthority } from '@/modules/contractor-access';
import { ContractorAccessManager } from '@/modules/contractor-access/ui/contractor-access-manager';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import {
  contractorPrincipalCommandAction,
  grantContractorAccessAction,
  inviteContractorAction,
  revokeContractorGrantAction,
  updateContractorGrantAction,
} from './actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorAccess' });
  return { title: t('manage.title') };
}

export default async function ProjectContractorAccessPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations('contractorAccess');

  const overview = await withOrgContext(async (context) => {
    const authority = await loadContractorAccessAuthority(context, projectId);
    if (!authority.canView) return null;
    return getContractorAccessOverview(context, projectId);
  });

  return (
    <WithClientMessages extra={['contractorAccess']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('manage.title')} description={t('manage.subtitle')} />
        {overview ? (
          <ContractorAccessManager
            projectId={projectId}
            overview={overview}
            actions={{
              invite: inviteContractorAction,
              grant: grantContractorAccessAction,
              update: updateContractorGrantAction,
              revoke: revokeContractorGrantAction,
              principalCommand: contractorPrincipalCommandAction,
            }}
          />
        ) : (
          <Alert tone="warning">{t('manage.forbidden')}</Alert>
        )}
      </div>
    </WithClientMessages>
  );
}
