import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { formatSubmittalNumber, getSubmittal, submittalStatusTone } from '@/modules/submittals';
import { SubmittalDetailActions } from '@/modules/submittals/ui/submittal-detail-actions';
import { statusTone } from '@/modules/submittals/ui/tones';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate, formatInstant } from '@/shared/dates';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectSubmittalDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; submittalId: string }>;
}) {
  const { projectId, submittalId } = await params;

  const data = await withOrgContext(async (context) => {
    try {
      const detail = await getSubmittal(context, submittalId);
      if (detail.projectId !== projectId) return null;
      return { detail, timeZone: context.organization.timezone };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const { detail, timeZone } = data;
  const [t, locale] = await Promise.all([getTranslations('submittals'), getLocale()]);
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/submittals`;
  const currentRevision = detail.revisions.find((r) => r.revisionNumber === detail.currentRevisionNumber);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Link
            href={base}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-brand)]"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('detail.back')}
          </Link>
        }
        title={`${formatSubmittalNumber(detail.number)} · ${detail.title}`}
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{t(`type.${detail.type}`)}</Badge>
            <Badge tone={statusTone(submittalStatusTone(detail.status, detail.overdue))}>
              {t(`status.${detail.status}`)}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.revisions')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {detail.revisions.map((revision) => (
                <div key={revision.id} className="rounded-lg border border-[var(--pf-border-default)] p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t('detail.revision', { number: revision.revisionNumber })}</span>
                    {revision.revisionNumber === detail.currentRevisionNumber ? (
                      <Badge tone="info">{t('detail.current')}</Badge>
                    ) : null}
                    {!revision.submittedAt ? <Badge tone="neutral">{t('detail.draftRevision')}</Badge> : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{revision.notes ?? t('detail.noNotes')}</p>
                  {revision.submittedAt ? (
                    <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                      {t('detail.submittedOn', { date: formatInstant(revision.submittedAt, locale, timeZone) })}
                    </p>
                  ) : null}
                  {revision.review ? (
                    <div className="mt-3 rounded-md bg-[var(--pf-bg-muted)] p-3 text-sm">
                      <Badge tone="neutral">{t(`decision.${revision.review.decision}`)}</Badge>
                      {revision.review.comments ? <p className="mt-2 whitespace-pre-wrap">{revision.review.comments}</p> : null}
                      <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                        {t('detail.reviewedOn', { date: formatInstant(revision.review.createdAt, locale, timeZone) })}
                        {revision.review.reviewerName
                          ? ` · ${t('detail.reviewedBy', { name: revision.review.reviewerName })}`
                          : null}
                      </p>
                    </div>
                  ) : revision.submittedAt ? (
                    <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('detail.awaitingReview')}</p>
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
                organizationId={detail.organizationId}
                entityType="submittal_revision"
                entityId={currentRevision?.id ?? detail.id}
                viewer="internal"
              />
              {detail.canManage && currentRevision ? (
                <EvidenceUploader
                  organizationId={detail.organizationId}
                  projectId={detail.projectId}
                  entityType="submittal_revision"
                  entityId={currentRevision.id}
                  viewer="internal"
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.discussion')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityDiscussion
                organizationId={detail.organizationId}
                projectId={detail.projectId}
                entityType="submittal"
                entityId={detail.id}
                viewer="internal"
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.details')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div>
                <span className="text-[var(--pf-text-secondary)]">{t('fields.contractor')}: </span>
                {detail.vendorName}
              </div>
              {detail.specSection ? (
                <div>
                  <span className="text-[var(--pf-text-secondary)]">{t('fields.specSection')}: </span>
                  {detail.specSection}
                </div>
              ) : null}
              {detail.dueDate ? (
                <div>
                  <span className="text-[var(--pf-text-secondary)]">{t('fields.dueDate')}: </span>
                  {formatBusinessDate(detail.dueDate as never, locale)}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {detail.canManage || detail.draftRevisionId ? (
            <WithClientMessages extra={['submittals', 'common']}>
              <SubmittalDetailActions
                submittalId={detail.id}
                availableActions={detail.availableActions}
                draftRevisionId={detail.draftRevisionId}
                currentRevisionId={currentRevision?.id ?? detail.revisions[0]!.id}
              />
            </WithClientMessages>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function ProjectSubmittalDetailPage(
  props: Omit<Parameters<typeof ProjectSubmittalDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectSubmittalDetailScreen {...props} />;
}
