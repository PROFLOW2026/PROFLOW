import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorAgreement, resolveContractorAgreementOrganization } from '@/modules/subcontracts';
import { AgreementSubNav } from '@/modules/subcontracts/ui/agreement-nav';
import { AgreementFacts, AgreementValueCard, WorkLinesPanel } from '@/modules/subcontracts/ui/lines-panel';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

/** Contractor portal: own contract lines; values only with ext.contract.view_value (decided server-side). */
export default async function ContractorAgreementPage({
  params,
}: {
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const { projectId, agreementId } = await params;
  const t = await getTranslations('subcontracts');
  const context = await requireExternalContext();
  const view = await loadOrNotFound(async () => {
    const organizationId = await resolveContractorAgreementOrganization(context, { projectId, agreementId });
    return getContractorAgreement(context, { organizationId, projectId, agreementId });
  });
  const base = `/contractor/projects/${projectId}/contracts/${agreementId}`;

  return (
    <WithPortalClientMessages extra={['subcontracts']}>
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={view.agreement.title}
        description={t('portal.contractDescription')}
        meta={<AgreementStatusBadge status={view.agreement.status} label={t(`agreementStatus.${view.agreement.status}`)} />}
      />
      <AgreementSubNav linesHref={base} changesHref={`${base}/changes`} current="lines" />
      <Card>
        <CardContent className="pt-4">
          <AgreementFacts agreement={view.agreement} />
        </CardContent>
      </Card>
      {view.financial ? <AgreementValueCard financial={view.financial} showTerms={false} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('lines.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkLinesPanel lines={view.lines} locations={[]} workPackages={[]} />
        </CardContent>
      </Card>
    </div>
    </WithPortalClientMessages>
  );
}
