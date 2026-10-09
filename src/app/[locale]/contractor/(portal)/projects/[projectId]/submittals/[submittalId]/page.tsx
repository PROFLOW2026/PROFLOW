import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { requireExternalContext } from '@/modules/contractor-access';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { formatSubmittalNumber, getContractorSubmittal, submittalStatusTone } from '@/modules/submittals';
import { ContractorSubmittalActions } from '@/modules/submittals/ui/contractor-submittal-actions';
import { statusTone } from '@/modules/submittals/ui/tones';
import { NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';
import { formatInstant } from '@/shared/dates';

export default async function ContractorSubmittalDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submittalId: string }>;
}) {
  const { projectId, submittalId } = await params;
  const context = await requireExternalContext();
  const organizationId = context.grants.find((g) => g.projectId === projectId || g.projectId === null)?.organizationId;
  if (!organizationId) notFound();

  let detail;
  try {
    detail = await getContractorSubmittal(context, { organizationId, submittalId });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  if (detail.projectId !== projectId) notFound();

  const [t, locale] = await Promise.all([getTranslations('submittals'), getLocale()]);
  const base = `/contractor/projects/${projectId}/submittals`;
  const currentRevision = detail.revisions.find((r) => r.revisionNumber === detail.currentRevisionNumber);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        breadcrumb={
          <Link href={base} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)]">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('portal.back')}
          </Link>
        }
        title={`${formatSubmittalNumber(detail.number)} · ${detail.title}`}
        meta={
          <Badge tone={statusTone(submittalStatusTone(detail.status, detail.overdue))}>{t(`status.${detail.status}`)}</Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.revisions')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.revisions.map((revision) => (
            <div key={revision.id} className="rounded-lg border border-[var(--pf-border-default)] p-4 text-sm">
              <div className="mb-2 font-medium">{t('detail.revision', { number: revision.revisionNumber })}</div>
              <p className="whitespace-pre-wrap">{revision.notes ?? t('detail.noNotes')}</p>
              {revision.review ? (
                <div className="mt-3 rounded-md bg-[var(--pf-bg-muted)] p-3">
                  <Badge tone="neutral">{t(`decision.${revision.review.decision}`)}</Badge>
                  {revision.review.comments ? <p className="mt-2 whitespace-pre-wrap">{revision.review.comments}</p> : null}
                  <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                    {t('detail.reviewedOn', { date: formatInstant(revision.review.createdAt, locale, 'UTC') })}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.attachments')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EvidenceGallery
            organizationId={organizationId}
            entityType="submittal_revision"
            entityId={currentRevision?.id ?? detail.id}
            viewer="external"
          />
          {detail.draftRevisionId && currentRevision ? (
            <EvidenceUploader
              organizationId={organizationId}
              projectId={detail.projectId}
              entityType="submittal_revision"
              entityId={currentRevision.id}
              viewer="external"
            />
          ) : null}
        </CardContent>
      </Card>

      <WithPortalClientMessages extra={['submittals', 'common']}>
        <ContractorSubmittalActions
          organizationId={organizationId}
          submittalId={detail.id}
          status={detail.status}
          availableActions={detail.availableActions}
          draftRevisionId={detail.draftRevisionId}
        />
      </WithPortalClientMessages>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.discussion')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityDiscussion
            organizationId={organizationId}
            projectId={detail.projectId}
            entityType="submittal"
            entityId={detail.id}
            viewer="external"
          />
        </CardContent>
      </Card>
    </div>
  );
}
