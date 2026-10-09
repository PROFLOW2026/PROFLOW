import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorDefect, resolveContractorProjectOrganization } from '@/modules/defects';
import { ContractorDefectPanel } from '@/modules/defects/ui/contractor-defect-panel';
import { DefectCycleHistory } from '@/modules/defects/ui/cycle-history';
import { defectStatusTone } from '@/modules/defects/ui/tones';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorDefectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; defectId: string }>;
}) {
  const { projectId, defectId } = await params;
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const defect = await loadOrNotFound(() => getContractorDefect(context, { organizationId, defectId }));
  const t = await getTranslations('defects');
  const base = `/contractor/projects/${projectId}/defects`;

  const lastRejected = [...defect.records].reverse().find((record) => record.kind === 'rejected');

  return (
    <WithPortalClientMessages extra={['defects']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader
          title={t('detailTitle', { ref: defect.referenceNo })}
          description={defect.title}
          breadcrumb={
            <Link href={base} className="text-sm text-[var(--pf-text-brand)] hover:underline">
              {t('portal.back')}
            </Link>
          }
          meta={<Badge tone={defectStatusTone(defect.status)}>{t(`status.${defect.status}`)}</Badge>}
        />

        <Card>
          <CardContent className="flex flex-col gap-2 p-4 text-sm">
            {defect.description ? <p className="whitespace-pre-wrap">{defect.description}</p> : null}
            <p className="text-[var(--pf-text-secondary)]">
              {t('fields.dueDate')}: {defect.dueDate ?? t('list.noDueDate')}
            </p>
            <p className="text-[var(--pf-text-secondary)]">{t('fields.cycle')}: {defect.cycleNo}</p>
          </CardContent>
        </Card>

        <ContractorDefectPanel
          organizationId={organizationId}
          projectId={projectId}
          defectId={defectId}
          canSubmitCompletion={defect.canSubmitCompletion}
          status={defect.status}
          lastRejectedNote={lastRejected?.note ?? null}
        />

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t('evidence.title')}</h3>
          <EvidenceGallery organizationId={organizationId} entityType="defect" entityId={defect.id} viewer="external" />
          {defect.canSubmitCompletion ? (
            <EvidenceUploader
              organizationId={organizationId}
              projectId={projectId}
              entityType="defect"
              entityId={defect.id}
              viewer="external"
              locationId={defect.locationId}
            />
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t('history.title')}</h3>
          <DefectCycleHistory records={defect.records} />
        </section>

        <EntityDiscussion
          organizationId={organizationId}
          projectId={projectId}
          entityType="defect"
          entityId={defect.id}
          viewer="external"
        />
      </div>
    </WithPortalClientMessages>
  );
}
