import { CalendarClock, ChevronLeft, ClipboardList, MapPin, Timer } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { listTasksLinkedFrom } from '@/modules/collaboration';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import {
  getCoordinationEventDetail,
  loadCoordinationFormOptions,
  type CoordinationFormOptions,
} from '@/modules/coordination';
import { CoordinationHistory } from '@/modules/coordination/ui/coordination-history';
import { CoordinationIssueList } from '@/modules/coordination/ui/issue-list';
import { LinkedDocuments } from '@/modules/coordination/ui/linked-documents';
import { CoordinationManagePanel } from '@/modules/coordination/ui/manage-panel';
import { ReadinessMatrix } from '@/modules/coordination/ui/readiness-matrix';
import { readinessTone, statusTone } from '@/modules/coordination/ui/tones';
import { buildDetailViews } from '@/modules/coordination/ui/view-models';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { withOrgContext } from '@/shared/auth/session';
import { formatInstant } from '@/shared/dates';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function CoordinationEventScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = await params;

  const data = await withOrgContext(async (context) => {
    try {
      const detail = await getCoordinationEventDetail(context, projectId, eventId);
      const formOptions: CoordinationFormOptions | null = detail.canManage
        ? await loadCoordinationFormOptions(context, projectId)
        : null;
      const followUpTasks = await listTasksLinkedFrom(
        context.db,
        context.organizationId,
        'coordination_event',
        eventId,
      );
      return { detail, formOptions, timeZone: context.organization.timezone, followUpTasks };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const { detail, formOptions, timeZone, followUpTasks } = data;
  const [t, locale] = await Promise.all([getTranslations('coordination'), getLocale()]);
  const fmt = (value: Date | null) => (value ? formatInstant(value, locale, timeZone) : null);
  const views = buildDetailViews(detail, locale, timeZone);
  const isOpen = detail.status === 'scheduled';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Link
            href={`${surfaceRoot ?? ('/projects/' + projectId)}/coordination`}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-brand)]"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('detail.backToList')}
          </Link>
        }
        title={detail.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t(`kinds.${detail.kind}`)}</Badge>
            <Badge tone={statusTone(detail.status)}>{t(`statuses.${detail.status}`)}</Badge>
            {isOpen ? (
              <Badge tone={readinessTone(detail.readiness.state)}>
                {t('readiness.label')}: {t(`readiness.${detail.readiness.state}`)}
              </Badge>
            ) : null}
            {isOpen && detail.readiness.overridden ? <Badge tone="neutral">{t('readiness.overridden')}</Badge> : null}
          </div>
        }
      />

      <WithClientMessages extra={['coordination']}>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('detail.matrix')}</CardTitle>
                <CardDescription>
                  {t('detail.matrixDescription')}
                  {isOpen && detail.readiness.overridden
                    ? ` ${t('readiness.computed', { state: t(`readiness.${detail.readiness.computedState}`) })}`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReadinessMatrix
                  projectId={projectId}
                  eventId={detail.id}
                  rows={views.matrix}
                  acknowledgements={detail.requiredAcknowledgements}
                  canManage={detail.canManage}
                  acceptsResponses={isOpen}
                  evidenceSlots={Object.fromEntries(
                    detail.contractors
                      .filter((party) => party.latestResponse)
                      .map((party) => [
                        party.id,
                        <EvidenceGallery
                          key={party.id}
                          organizationId={detail.organizationId}
                          entityType="coordination_response"
                          entityId={party.latestResponse!.id}
                          viewer="internal"
                        />,
                      ]),
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.linkedTasks')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {followUpTasks.length === 0 ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.linkedTasksEmpty')}</p>
                ) : (
                  followUpTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={
                        surfaceRoot?.startsWith('/employee')
                          ? `/employee/tasks/${task.id}`
                          : `/tasks/${task.id}`
                      }
                      className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
                    >
                      {task.title}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {detail.canManage && formOptions ? (
              <Card>
                <CardContent className="pt-4">
                  <CoordinationManagePanel view={views.manage} options={formOptions} />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.issues')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CoordinationIssueList
                  projectId={projectId}
                  eventId={detail.id}
                  issues={views.issues}
                  canManage={detail.canManage}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.history')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CoordinationHistory detail={detail} locale={locale} timeZone={timeZone} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.evidence')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <EvidenceGallery
                  organizationId={detail.organizationId}
                  entityType="coordination_event"
                  entityId={detail.id}
                  viewer="internal"
                />
                {detail.canManage ? (
                  <EvidenceUploader
                    organizationId={detail.organizationId}
                    projectId={projectId}
                    entityType="coordination_event"
                    entityId={detail.id}
                    viewer="internal"
                    defaultVisibility="internal"
                    locationId={detail.locationId}
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
                  projectId={projectId}
                  entityType="coordination_event"
                  entityId={detail.id}
                  viewer="internal"
                />
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('detail.details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div>
                      <dt className="text-[var(--pf-text-secondary)]">{t('fields.startsAt')}</dt>
                      <dd>
                        {fmt(detail.startsAt)}
                        {detail.endsAt ? ` – ${fmt(detail.endsAt)}` : ''}
                      </dd>
                    </div>
                  </div>
                  {detail.preparationDeadline ? (
                    <div className="flex items-start gap-2">
                      <Timer className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <dt className="text-[var(--pf-text-secondary)]">{t('fields.preparationDeadline')}</dt>
                        <dd>{fmt(detail.preparationDeadline)}</dd>
                      </div>
                    </div>
                  ) : null}
                  {detail.locationName || detail.locationNote ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <dt className="text-[var(--pf-text-secondary)]">{t('fields.location')}</dt>
                        <dd>{[detail.locationName, detail.locationNote].filter(Boolean).join(' · ')}</dd>
                      </div>
                    </div>
                  ) : null}
                  {detail.workPackageName || detail.phaseName ? (
                    <div className="flex items-start gap-2">
                      <ClipboardList className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <dt className="text-[var(--pf-text-secondary)]">
                          {t('fields.workPackage')} / {t('fields.phase')}
                        </dt>
                        <dd>{[detail.workPackageName, detail.phaseName].filter(Boolean).join(' · ')}</dd>
                      </div>
                    </div>
                  ) : null}
                </dl>
                {detail.description ? <p className="mt-4 whitespace-pre-line text-sm">{detail.description}</p> : null}
              </CardContent>
            </Card>

            {detail.requiredAcknowledgements.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('fields.requiredAcknowledgements')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc ps-5 text-sm">
                    {detail.requiredAcknowledgements.map((item) => (
                      <li key={item.key}>{item.label}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.documents')}</CardTitle>
              </CardHeader>
              <CardContent>
                <LinkedDocuments
                  projectId={projectId}
                  eventId={detail.id}
                  documents={views.documents}
                  canManage={detail.canManage}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('detail.internalTeam')}</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.internalParticipants.length === 0 ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noInternalTeam')}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {detail.internalParticipants.map((participant) => (
                      <li key={participant.id}>{participant.displayName}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </WithClientMessages>
    </div>
  );
}

export default function CoordinationEventPage(
  props: Omit<Parameters<typeof CoordinationEventScreen>[0], 'surfaceRoot'>,
) {
  return <CoordinationEventScreen {...props} />;
}
