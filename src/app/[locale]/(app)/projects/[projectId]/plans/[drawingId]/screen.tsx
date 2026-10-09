import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { getDrawingDetail } from '@/modules/project-plans';
import { RevisionUploadForm } from '@/modules/project-plans/ui/revision-upload-form';
import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { projectFileDeps } from '@/modules/evidence/server';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { INTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/routes';

export async function ProjectDrawingDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; drawingId: string }>;
}) {
  const { projectId, drawingId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  const loaded = await withOrgContext(async (context) => {
    try {
      const drawingDetail = await getDrawingDetail(context, drawingId, projectFileDeps);
      return { detail: drawingDetail, organizationId: context.organizationId };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (!loaded || loaded.detail.drawing.projectId !== projectId) notFound();
  const { detail, organizationId } = loaded;

  const t = await getTranslations('projectPlans.detail');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Link href={`${surfaceRoot ?? ('/projects/' + projectId)}/plans`} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)]">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('back')}
          </Link>
        }
        title={`${detail.drawing.drawingNumber} · ${detail.drawing.title}`}
        meta={<Badge tone="neutral">{t(`discipline.${detail.drawing.discipline}`)}</Badge>}
      />

      {detail.canManage ? (
        <WithAppClientMessages extra={['projectPlans']}>
          <RevisionUploadForm projectId={projectId} drawingId={drawingId} suggestedLabel={detail.suggestedNextLabel} />
        </WithAppClientMessages>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('revisions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.revisions.map((revision) => (
            <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 last:border-0">
              <div>
                <span className="font-medium">Rev {revision.revisionLabel}</span>
                <Badge tone="neutral" className="ms-2">
                  {t(`revisionStatus.${revision.status}`)}
                </Badge>
              </div>
              {revision.fileReady ? (
                <a
                  href={`${INTERNAL_REVISION_DOWNLOAD_PATH}/${revision.id}`}
                  className="text-sm text-[var(--pf-text-brand)] hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {revision.fileName}
                </a>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('distribution')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {detail.distribution.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('distributionEmpty')}</p>
          ) : (
            detail.distribution.map((entry) => (
              <p key={entry.id} className="text-sm">
                {entry.agreementTitle ?? entry.vendorName ?? entry.principalName ?? entry.audience}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('evidence')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EvidenceGallery organizationId={organizationId} entityType="drawing" entityId={drawingId} viewer="internal" />
          {detail.canManage ? (
            <EvidenceUploader
              organizationId={organizationId}
              projectId={projectId}
              entityType="drawing"
              entityId={drawingId}
              viewer="internal"
              defaultVisibility="contractor"
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProjectDrawingDetailPage(
  props: Omit<Parameters<typeof ProjectDrawingDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectDrawingDetailScreen {...props} />;
}
