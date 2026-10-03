import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { getAgreementWorkspace } from '@/modules/subcontracts';
import { AgreementSubNav } from '@/modules/subcontracts/ui/agreement-nav';
import {
  AddWorkLineForm,
  AgreementHeaderForm,
  ArchiveWorkLineForm,
  FinancialTermsForm,
  LifecycleActions,
  WorkLineEditForm,
} from '@/modules/subcontracts/ui/forms';
import { AgreementFacts, AgreementValueCard, WorkLinesPanel } from '@/modules/subcontracts/ui/lines-panel';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function AgreementLinesScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const { projectId, agreementId } = await params;
  const t = await getTranslations('subcontracts');
  const workspace = await loadOrNotFound(() =>
    withOrgContext((context) => getAgreementWorkspace(context, agreementId)),
  );
  if (workspace.agreement.projectId !== projectId) notFound();

  const { agreement, access, lines, financial, baselineEditable } = workspace;
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/contractors/${agreementId}`;
  const locations = workspace.locations.map((location) => ({
    id: location.id,
    name: location.code ? `${location.code} · ${location.name}` : location.name,
  }));
  const editableLines = access.canManageContract || access.canCoordinate;

  return (
    <WithClientMessages extra={['subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={agreement.title}
          description={t('lines.pageDescription')}
          meta={<AgreementStatusBadge status={agreement.status} label={t(`agreementStatus.${agreement.status}`)} />}
        />
        <AgreementSubNav overviewHref={base} linesHref={`${base}/lines`} changesHref={`${base}/changes`} current="lines" />

        <Card>
          <CardContent className="pt-4">
            <AgreementFacts agreement={agreement} />
          </CardContent>
        </Card>

        {financial ? <AgreementValueCard financial={financial} showTerms /> : null}

        {access.canManageContract && workspace.availableActions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('lifecycle.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <LifecycleActions projectId={projectId} agreementId={agreement.id} actions={workspace.availableActions} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('lines.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!baselineEditable ? <p className="text-sm text-[var(--pf-text-secondary)]">{t('lines.baselineLocked')}</p> : null}
            <WorkLinesPanel
              lines={lines}
              locations={locations}
              workPackages={workspace.workPackages}
              renderLineActions={
                editableLines && agreement.status !== 'closed' && agreement.status !== 'cancelled'
                  ? (line) => (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--pf-text-brand)]">{t('lines.edit')}</summary>
                        <div className="mt-2 flex flex-col gap-2">
                          <WorkLineEditForm
                            projectId={projectId}
                            agreementId={agreement.id}
                            line={{
                              ...line,
                              unitPrice: line.financial?.unitPrice,
                              contractAmount: line.financial?.contractBaselineAmount,
                            }}
                            baselineEditable={baselineEditable && access.canManageContract}
                            showPrices={access.canManageContract}
                            locations={locations}
                            workPackages={workspace.workPackages}
                          />
                          {baselineEditable && access.canManageContract ? (
                            <ArchiveWorkLineForm projectId={projectId} agreementId={agreement.id} workLineId={line.id} />
                          ) : null}
                        </div>
                      </details>
                    )
                  : undefined
              }
            />
            {baselineEditable && access.canManageContract ? (
              <details className="rounded-md border border-[var(--pf-border-subtle)] p-3">
                <summary className="cursor-pointer text-sm font-medium">{t('lines.add')}</summary>
                <div className="mt-3">
                  <AddWorkLineForm
                    projectId={projectId}
                    agreementId={agreement.id}
                    locations={locations}
                    workPackages={workspace.workPackages}
                    showPrices
                  />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        {access.canManageContract && agreement.status !== 'closed' && agreement.status !== 'cancelled' ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('agreement.editTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <AgreementHeaderForm
                projectId={projectId}
                agreement={agreement}
                workPackages={workspace.workPackages}
                baselineEditable={baselineEditable}
              />
              {baselineEditable && financial ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t('terms.title')}</h3>
                  <FinancialTermsForm
                    projectId={projectId}
                    agreementId={agreement.id}
                    terms={financial}
                    valueFromLines={lines.length > 0}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </WithClientMessages>
  );
}

export default function AgreementLinesPage(
  props: Omit<Parameters<typeof AgreementLinesScreen>[0], 'surfaceRoot'>,
) {
  return <AgreementLinesScreen {...props} />;
}
