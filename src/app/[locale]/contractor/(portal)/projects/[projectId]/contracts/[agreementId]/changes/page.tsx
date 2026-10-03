import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  agreementAcceptsChanges,
  getContractorAgreement,
  listContractorChanges,
  resolveContractorAgreementOrganization,
} from '@/modules/subcontracts';
import { AgreementSubNav } from '@/modules/subcontracts/ui/agreement-nav';
import { ChangesPanel } from '@/modules/subcontracts/ui/changes-panel';
import { ContractorCounterForm, ContractorProposalForm } from '@/modules/subcontracts/ui/forms';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

/** Contractor portal: changes of the own contract; proposals and counter-offers with ext.change.request. */
export default async function ContractorChangesPage({
  params,
}: {
  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const { projectId, agreementId } = await params;
  const t = await getTranslations('subcontracts');
  const context = await requireExternalContext();
  const data = await loadOrNotFound(async () => {
    const organizationId = await resolveContractorAgreementOrganization(context, { projectId, agreementId });
    const [agreementView, changesView] = await Promise.all([
      getContractorAgreement(context, { organizationId, projectId, agreementId }),
      listContractorChanges(context, { organizationId, projectId, agreementId }),
    ]);
    return { organizationId, agreementView, changesView };
  });
  const { organizationId, agreementView, changesView } = data;
  const base = `/contractor/projects/${projectId}/contracts/${agreementId}`;
  const running = agreementAcceptsChanges(agreementView.agreement.status);
  const lineOptions = agreementView.lines
    .filter((line) => line.status === 'active')
    .map((line) => ({ id: line.id, label: line.code ? `${line.code} · ${line.description}` : line.description }));

  return (
    <WithClientMessages extra={['subcontracts']}>
      <div className="flex flex-col gap-4 pb-6">
        <PageHeader title={agreementView.agreement.title} description={t('portal.changesDescription')} />
        <AgreementSubNav linesHref={base} changesHref={`${base}/changes`} current="changes" />

        {changesView.canProposeChange && running ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('portal.proposeTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ContractorProposalForm
                organizationId={organizationId}
                projectId={projectId}
                agreementId={agreementId}
                lineOptions={lineOptions}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('changes.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangesPanel
              changes={changesView.changes}
              lines={agreementView.lines}
              renderActions={(change) =>
                changesView.canProposeChange &&
                running &&
                (change.status === 'submitted' || change.status === 'under_negotiation') ? (
                  <details className="rounded-md border border-[var(--pf-border-subtle)] p-3">
                    <summary className="cursor-pointer text-sm font-medium">{t('portal.counterTitle')}</summary>
                    <div className="mt-3">
                      <ContractorCounterForm
                        organizationId={organizationId}
                        projectId={projectId}
                        agreementId={agreementId}
                        changeId={change.id}
                        lineOptions={lineOptions}
                      />
                    </div>
                  </details>
                ) : null
              }
            />
          </CardContent>
        </Card>
      </div>
    </WithClientMessages>
  );
}
