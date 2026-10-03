import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { listClaimableAgreements, listProjectDeductions } from '@/modules/subcontract-claims';
import { DeductionsList, IssueDeductionForm } from '@/modules/subcontract-claims/ui/deductions-panel';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectDeductionsScreen({ surfaceRoot: _surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await requireProjectCapabilityPage(projectId, 'claim.view');
  const t = await getTranslations('subcontractClaims');

  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => ({
      items: await listProjectDeductions(context, projectId),
      agreements: access.has('deductions.manage')
        ? (await listClaimableAgreements(context, projectId)).map((a) => ({ id: a.agreementId, title: a.title }))
        : [],
    })),
  );

  return (
    <WithClientMessages extra={['subcontractClaims']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('deductions.pageTitle')} description={t('deductions.pageDescription')} />
        {access.has('deductions.manage') && data.agreements.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('deductions.issue')}</CardTitle>
            </CardHeader>
            <CardContent>
              <IssueDeductionForm projectId={projectId} agreements={data.agreements} />
            </CardContent>
          </Card>
        ) : null}
        <DeductionsList items={data.items} />
      </div>
    </WithClientMessages>
  );
}

export default function ProjectDeductionsPage(
  props: Omit<Parameters<typeof ProjectDeductionsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectDeductionsScreen {...props} />;
}
