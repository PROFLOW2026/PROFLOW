import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion, EntityLinkedTasksSection } from '@/modules/collaboration/ui';
import { formatRfiNumber, getRfi, rfiStatusTone } from '@/modules/rfi';
import { RfiDetailActions } from '@/modules/rfi/ui/rfi-detail-actions';
import { RfiHistory } from '@/modules/rfi/ui/rfi-history';
import { statusTone } from '@/modules/rfi/ui/tones';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate, formatInstant } from '@/shared/dates';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectRfiDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; rfiId: string }>;
}) {
  const { projectId, rfiId } = await params;

  const data = await withOrgContext(async (context) => {
    try {
      const detail = await getRfi(context, rfiId);
      if (detail.projectId !== projectId) return null;
      return { detail, timeZone: context.organization.timezone };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const { detail, timeZone } = data;
  const [t, locale] = await Promise.all([getTranslations('rfi'), getLocale()]);
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/rfi`;

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
        title={`${formatRfiNumber(detail.number)} · ${detail.subject}`}
        meta={
          <Badge tone={statusTone(rfiStatusTone(detail.status, detail.overdue))}>{t(`status.${detail.status}`)}</Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.question')}</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{detail.question}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.answers')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {detail.answers.length === 0 ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noAnswers')}</p>
              ) : (
                detail.answers.map((answer, index) => (
                  <div key={answer.id} className="rounded-lg border border-[var(--pf-border-default)] p-4">
                    {index === detail.answers.length - 1 ? (
                      <Badge tone="success" className="mb-2">
                        {t('detail.currentAnswer')}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="mb-2">
                        {t('detail.superseded')}
                      </Badge>
                    )}
                    <p className="whitespace-pre-wrap text-sm">{answer.body}</p>
                    <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                      {t('detail.answeredOn', { date: formatInstant(answer.createdAt, locale, timeZone) })}
                      {answer.answeredByName ? ` · ${t('detail.answeredBy', { name: answer.answeredByName })}` : null}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <RfiHistory entries={detail.history} locale={locale} timeZone={timeZone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.attachments')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <EvidenceGallery
                organizationId={detail.organizationId}
                entityType="rfi"
                entityId={detail.id}
                viewer="internal"
              />
              {detail.canManage ? (
                <EvidenceUploader
                  organizationId={detail.organizationId}
                  projectId={detail.projectId}
                  entityType="rfi"
                  entityId={detail.id}
                  viewer="internal"
                />
              ) : null}
            </CardContent>
          </Card>

          <WithAppClientMessages extra={['collaboration']}>
            <EntityLinkedTasksSection
              projectId={detail.projectId}
              entityType="rfi"
              entityId={detail.id}
              defaultTaskTitle={`${formatRfiNumber(detail.number)} · ${detail.subject}`}
            />
          </WithAppClientMessages>

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.discussion')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityDiscussion
                organizationId={detail.organizationId}
                projectId={detail.projectId}
                entityType="rfi"
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
                {detail.vendorName ?? t('fields.noContractor')}
              </div>
              {detail.locationName ? (
                <div>
                  <span className="text-[var(--pf-text-secondary)]">{t('fields.location')}: </span>
                  {detail.locationName}
                </div>
              ) : null}
              {detail.dueDate ? (
                <div>
                  <span className="text-[var(--pf-text-secondary)]">{t('fields.dueDate')}: </span>
                  {formatBusinessDate(detail.dueDate as never, locale)}
                </div>
              ) : null}
              {detail.assigneeName ? (
                <div>
                  <span className="text-[var(--pf-text-secondary)]">{t('fields.assignee')}: </span>
                  {detail.assigneeName}
                </div>
              ) : null}
              <div>
                <span className="text-[var(--pf-text-secondary)]">{t('fields.raisedBy')}: </span>
                {detail.raisedByName ?? (detail.raisedActorType === 'external' ? t('actor.contractor') : t('actor.team'))}
                {' · '}
                {formatInstant(detail.createdAt, locale, timeZone)}
              </div>
            </CardContent>
          </Card>

          {detail.canManage ? (
            <WithAppClientMessages extra={['rfi', 'common']}>
              <RfiDetailActions rfiId={detail.id} availableActions={detail.availableActions} />
            </WithAppClientMessages>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function ProjectRfiDetailPage(
  props: Omit<Parameters<typeof ProjectRfiDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectRfiDetailScreen {...props} />;
}
