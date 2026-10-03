import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  agreementAcceptsChanges,
  getAgreementWorkspace,
  listAgreementChanges,
} from '@/modules/subcontracts';
import { AgreementSubNav } from '@/modules/subcontracts/ui/agreement-nav';
import { ChangesPanel } from '@/modules/subcontracts/ui/changes-panel';
import { ChangeActions, CreateChangeForm } from '@/modules/subcontracts/ui/forms';
import { AgreementValueCard } from '@/modules/subcontracts/ui/lines-panel';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { AgreementStatusBadge } from '@/modules/subcontracts/ui/status';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function AgreementChangesScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; agreementId: string }>;
}) {
  const { projectId, agreementId } = await params;
  const t = await getTranslations('subcontracts');
  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => {
      const workspace = await getAgreementWorkspace(context, agreementId);
      const { changes } = await listAgreementChanges(context, agreementId);
      return { workspace, changes };
    }),
  );
  const { agreement, access, lines, financial } = data.workspace;
  if (agreement.projectId !== projectId) notFound();

  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/contractors/${agreementId}`;
  const running = agreementAcceptsChanges(agreement.status);
  const canRaise = running && (access.canCoordinate || access.canManageContract || access.canManageChangeFinancial);
  const lineOptions = lines
    .filter((line) => line.status === 'active')
    .map((line) => ({ id: line.id, label: line.code ? `${line.code} · ${line.description}` : line.description }));

  return (
    <WithClientMessages extra={['subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={agreement.title}
          description={t('changes.pageDescription')}
          meta={<AgreementStatusBadge status={agreement.status} label={t(`agreementStatus.${agreement.status}`)} />}
        />
        <AgreementSubNav overviewHref={base} linesHref={`${base}/lines`} changesHref={`${base}/changes`} current="changes" />

        {financial ? <AgreementValueCard financial={financial} showTerms={false} /> : null}

        {canRaise ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('changes.createTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateChangeForm projectId={projectId} agreementId={agreement.id} />
            </CardContent>
          </Card>
        ) : !running ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('changes.notRunning')}</p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('changes.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!access.canViewFinancial ? (
              <p className="mb-3 text-xs text-[var(--pf-text-muted)]">{t('changes.operationalNote')}</p>
            ) : null}
            <ChangesPanel
              changes={data.changes}
              lines={lines}
              renderActions={(change) => {
                const open = change.status === 'draft' || change.status === 'submitted' || change.status === 'under_negotiation';
                if (!open || !running) return null;
                const raiser = access.canCoordinate || access.canManageContract || access.canManageChangeFinancial;
                return (
                  <ChangeActions
                    projectId={projectId}
                    agreementId={agreement.id}
                    changeId={change.id}
                    flags={{
                      canSubmit: raiser && change.status === 'draft',
                      canWithdraw: raiser && change.createdActorType !== 'external',
                      canPropose: access.canManageChangeFinancial,
                      canDecide: access.canManageChangeFinancial && change.status !== 'draft',
                    }}
                    versions={(change.versions ?? []).map((version) => ({ id: version.id, versionNo: version.versionNo }))}
                    lineOptions={lineOptions}
                  />
                );
              }}
            />
          </CardContent>
        </Card>
      </div>
    </WithClientMessages>
  );
}

export default function AgreementChangesPage(
  props: Omit<Parameters<typeof AgreementChangesScreen>[0], 'surfaceRoot'>,
) {
  return <AgreementChangesScreen {...props} />;
}
